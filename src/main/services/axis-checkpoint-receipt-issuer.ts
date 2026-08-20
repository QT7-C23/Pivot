import { stat } from 'node:fs/promises'
import {
  AxisCheckpointReceiptBatchSchema,
  AxisExecutionGrantSchema,
  AxisTaskSchema,
  type AxisCheckpointReceiptBatch,
  type AxisExecutionGrant,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import type { FileCheckpointRecord } from '../../shared/types/domain'
import { resolveProjectPathWithinRoot } from './file-system'
import { AxisExecutionBlockedError } from './axis-permission-grant-collector'

export interface AxisCheckpointStorePort {
  create(sessionId: string, projectRoot: string, filePath: string): Promise<FileCheckpointRecord>
}

export class AxisCheckpointReceiptIssuer {
  private readonly checkpoints: AxisCheckpointStorePort
  private readonly clock: () => Date

  constructor(options: { checkpoints: AxisCheckpointStorePort; clock?: () => Date }) {
    this.checkpoints = options.checkpoints
    this.clock = options.clock ?? (() => new Date())
  }

  async issue(input: {
    grant: AxisExecutionGrant
    signal?: AbortSignal
    task: AxisTask
  }): Promise<AxisCheckpointReceiptBatch> {
    assertNotAborted(input.signal)
    const grant = AxisExecutionGrantSchema.parse(input.grant)
    const task = AxisTaskSchema.parse(input.task)
    if (grant.taskId !== task.id) throw new AxisExecutionBlockedError('authority-failed', 'Checkpoint grant does not own the task')
    const taskFiles = await Promise.all(task.assignedFiles.map((filePath) => (
      resolveProjectPathWithinRoot(grant.projectRoot, filePath, { allowMissingLeaf: true })
    )))
    if (!sameValues(taskFiles, grant.grantedFiles) || !sameValues(task.requiredTools, grant.grantedTools)) {
      throw new AxisExecutionBlockedError('authority-failed', 'Checkpoint grant capabilities must exactly match the authoritative task')
    }

    const receipts = []
    for (const filePath of grant.grantedFiles) {
      assertNotAborted(input.signal)
      try {
        const fileStats = await stat(filePath)
        if (!fileStats.isFile()) throw new Error('Only regular files can receive Axis checkpoints')
        const checkpoint = await this.checkpoints.create(grant.sessionId, grant.projectRoot, filePath)
        if (checkpoint.filePath !== filePath || checkpoint.sessionId !== grant.sessionId) {
          throw new Error('Checkpoint store returned a record outside the requested file or session')
        }
        receipts.push({
          checkpointId: checkpoint.id,
          filePath,
          priorState: 'existing-file' as const,
          rollbackAction: 'restore-checkpoint' as const,
        })
      } catch (error) {
        if (isNotFoundError(error)) {
          receipts.push({
            checkpointId: null,
            filePath,
            priorState: 'new-file' as const,
            rollbackAction: 'delete-created-file' as const,
          })
          continue
        }
        throw new AxisExecutionBlockedError(
          'checkpoint-failed',
          `Checkpoint creation failed for ${filePath}: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }
    assertNotAborted(input.signal)

    return AxisCheckpointReceiptBatchSchema.parse({
      createdAt: this.clock().toISOString(),
      projectRoot: grant.projectRoot,
      receipts,
      runId: grant.runId,
      schemaVersion: 1,
      sessionId: grant.sessionId,
      status: 'ready',
      taskId: grant.taskId,
    })
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AxisExecutionBlockedError('aborted', 'Axis execution was aborted during checkpoint creation')
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function sameValues(left: string[], right: string[]): boolean {
  return new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}
