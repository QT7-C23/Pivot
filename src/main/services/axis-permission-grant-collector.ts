import {
  AxisExecutionGrantSchema,
  AxisTaskSchema,
  type AxisExecutionGrant,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import { resolvePathWithinRoot, resolveProjectPathWithinRoot } from './file-system'

export type AxisPermissionBlockReason = 'permission-denied' | 'permission-timeout' | 'permission-error' | 'aborted' | 'authority-failed'

export interface AxisToolPermissionRequest {
  assignedFiles: string[]
  runId: string
  sessionId: string
  taskId: string
  toolName: string
}

export interface AxisToolPermissionOutcome {
  behavior: 'allow' | 'deny'
  reason: 'response' | 'timeout' | 'abort' | 'error'
}

export interface AxisToolPermissionPort {
  request(input: AxisToolPermissionRequest, signal?: AbortSignal): Promise<AxisToolPermissionOutcome>
}

export class AxisExecutionBlockedError extends Error {
  readonly reason: AxisPermissionBlockReason | 'checkpoint-failed'

  constructor(reason: AxisPermissionBlockReason | 'checkpoint-failed', message: string) {
    super(message)
    this.name = 'AxisExecutionBlockedError'
    this.reason = reason
  }
}

export class AxisMainPermissionGrantCollector {
  private readonly clock: () => Date
  private readonly permissions: AxisToolPermissionPort
  private readonly projectRootForSession: (sessionId: string) => string | null

  constructor(options: {
    clock?: () => Date
    permissions: AxisToolPermissionPort
    projectRootForSession: (sessionId: string) => string | null
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.permissions = options.permissions
    this.projectRootForSession = options.projectRootForSession
  }

  async collect(input: {
    projectRoot: string
    runId: string
    sessionId: string
    signal?: AbortSignal
    task: AxisTask
  }): Promise<AxisExecutionGrant> {
    assertNotAborted(input.signal)
    const task = AxisTaskSchema.parse(input.task)
    const authoritativeRoot = this.projectRootForSession(input.sessionId)
    if (!authoritativeRoot) throw new AxisExecutionBlockedError('authority-failed', `Unknown authoritative session project root: ${input.sessionId}`)
    const projectRoot = await resolvePathWithinRoot(authoritativeRoot, authoritativeRoot)
    const requestedRoot = await resolvePathWithinRoot(input.projectRoot, input.projectRoot)
    if (projectRoot !== requestedRoot) {
      throw new AxisExecutionBlockedError('authority-failed', 'Permission request project root does not match the authoritative session binding')
    }
    if (task.assignedFiles.length === 0 || task.requiredTools.length === 0) {
      throw new AxisExecutionBlockedError('authority-failed', 'Mutation permission requires at least one task tool and assigned file')
    }
    const grantedFiles = await Promise.all(unique(task.assignedFiles).map((filePath) => (
      resolveProjectPathWithinRoot(projectRoot, filePath, { allowMissingLeaf: true })
    )))
    const grantedTools = unique(task.requiredTools)

    for (const toolName of grantedTools) {
      assertNotAborted(input.signal)
      let outcome: AxisToolPermissionOutcome
      try {
        outcome = await this.permissions.request({
          assignedFiles: [...grantedFiles],
          runId: input.runId,
          sessionId: input.sessionId,
          taskId: task.id,
          toolName,
        }, input.signal)
      } catch (error) {
        if (input.signal?.aborted) throw new AxisExecutionBlockedError('aborted', 'Axis execution was aborted during permission collection')
        throw new AxisExecutionBlockedError('permission-error', error instanceof Error ? error.message : 'Permission collection failed')
      }
      assertNotAborted(input.signal)
      if (outcome.behavior !== 'allow') {
        const reason = outcome.reason === 'timeout'
          ? 'permission-timeout'
          : outcome.reason === 'abort'
            ? 'aborted'
            : outcome.reason === 'error'
              ? 'permission-error'
              : 'permission-denied'
        throw new AxisExecutionBlockedError(reason, `Axis execution permission was not granted for ${toolName}: ${outcome.reason}`)
      }
      if (outcome.reason !== 'response') {
        throw new AxisExecutionBlockedError('permission-error', `Invalid allow outcome for ${toolName}: ${outcome.reason}`)
      }
    }

    return AxisExecutionGrantSchema.parse({
      authority: 'pivot-main',
      grantedAt: this.clock().toISOString(),
      grantedFiles,
      grantedTools,
      projectRoot,
      runId: input.runId,
      schemaVersion: 1,
      sessionId: input.sessionId,
      status: 'granted',
      taskId: task.id,
    })
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AxisExecutionBlockedError('aborted', 'Axis execution was aborted')
}

function unique(values: string[]): string[] {
  if (new Set(values).size !== values.length) {
    throw new AxisExecutionBlockedError('authority-failed', 'Task capabilities must be unique before permission collection')
  }
  return [...values]
}
