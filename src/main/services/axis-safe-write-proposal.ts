import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import {
  AxisModelUsageSchema,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import type { AxisProjectBinding } from '../../shared/axis-project-binding-contracts'
import {
  AxisSafeWriteProposalModelOutputSchema,
  AxisSafeWriteProposalRequestSchema,
  AxisSafeWriteProposalResultSchema,
  AxisSafeWriteProposalSchema,
  type AxisSafeWriteProposal,
  type AxisSafeWriteProposalRequest,
  type AxisSafeWriteProposalResult,
} from '../../shared/axis-safe-write-proposal-contracts'
import { AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS } from '../../shared/axis-guarded-safe-write-contracts'
import { resolveProjectPathWithinRoot } from './file-system'
import type { AxisGuardedTaskReaderPort } from './axis-guarded-safe-write-ports'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import type {
  AxisReviewedProposalBaseline,
  AxisReviewedProposalReceiptIssuerPort,
} from './axis-reviewed-proposal-ports'
import type {
  AxisSafeWriteProposalFileReaderPort,
  AxisSafeWriteProposalModelPort,
  AxisSafeWriteProposalRunStatePort,
  AxisSafeWriteProposalSource,
} from './axis-safe-write-proposal-ports'

const MAX_SOURCE_FILE_BYTES = 1024 * 1024

export class AxisMainSafeWriteProposalFileReaderAdapter
implements AxisSafeWriteProposalFileReaderPort {
  async readAll(
    binding: AxisProjectBinding,
    filePaths: string[],
  ): Promise<AxisSafeWriteProposalSource[]> {
    return Promise.all(filePaths.map(async (filePath) => {
      const resolved = await resolveProjectPathWithinRoot(
        binding.projectRoot,
        filePath,
        { allowMissingLeaf: true },
      )
      try {
        const fileStats = await stat(resolved)
        if (!fileStats.isFile()) {
          throw new Error(`Axis safe-write proposal source must be a file: ${filePath}`)
        }
        if (fileStats.size > MAX_SOURCE_FILE_BYTES) {
          throw new Error(`Axis safe-write proposal source exceeds 1 MiB: ${filePath}`)
        }
        const bytes = await readFile(resolved)
        if (bytes.length > MAX_SOURCE_FILE_BYTES) {
          throw new Error(`Axis safe-write proposal source exceeds 1 MiB: ${filePath}`)
        }
        return {
          content: bytes.toString('utf8'),
          filePath,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          state: 'existing' as const,
        }
      } catch (error) {
        if (!isNotFound(error)) throw error
        return {
          content: '',
          filePath,
          sha256: null,
          state: 'missing' as const,
        }
      }
    }))
  }
}

export class AxisSafeWriteProposalService {
  private readonly clock: () => Date
  private readonly files: AxisSafeWriteProposalFileReaderPort
  private readonly idFactory: () => string
  private readonly model: AxisSafeWriteProposalModelPort
  private readonly projects: AxisProjectBindingReaderPort
  private readonly receipts: AxisReviewedProposalReceiptIssuerPort
  private readonly runStates: AxisSafeWriteProposalRunStatePort
  private readonly tasks: AxisGuardedTaskReaderPort

  constructor(options: {
    clock?: () => Date
    files: AxisSafeWriteProposalFileReaderPort
    idFactory?: () => string
    model: AxisSafeWriteProposalModelPort
    projects: AxisProjectBindingReaderPort
    receipts: AxisReviewedProposalReceiptIssuerPort
    runStates: AxisSafeWriteProposalRunStatePort
    tasks: AxisGuardedTaskReaderPort
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.files = options.files
    this.idFactory = options.idFactory ?? (() => `proposal-${randomUUID()}`)
    this.model = options.model
    this.projects = options.projects
    this.receipts = options.receipts
    this.runStates = options.runStates
    this.tasks = options.tasks
  }

  async propose(
    requestInput: AxisSafeWriteProposalRequest,
  ): Promise<AxisSafeWriteProposalResult> {
    const request = AxisSafeWriteProposalRequestSchema.parse(requestInput)
    const binding = {
      runId: request.runId,
      sessionId: request.sessionId,
      taskId: request.taskId,
    }
    const runState = this.runStates.find(binding)
    if (!runState || runState.sessionId !== request.sessionId) {
      throw new Error(`Axis run state not found: ${request.runId}`)
    }
    if (runState.revision !== request.expectedRevision) {
      throw new Error(
        `Axis run state revision conflict: expected ${request.expectedRevision}, current ${runState.revision}`,
      )
    }
    const taskState = runState.tasks.find((candidate) => (
      candidate.taskId === request.taskId
    ))
    if (!taskState || taskState.status !== 'pending') {
      throw new Error(`Axis safe-write proposal requires a pending task: ${request.taskId}`)
    }
    const task = this.tasks.findTask(binding)
    if (!task) {
      throw new Error(`Axis guarded task not found: ${request.taskId}`)
    }
    assertSafeWriteTask(task)
    const project = this.projects.findBySession(request.sessionId)
    if (!project) {
      throw new Error(`Axis project binding not found: ${request.sessionId}`)
    }
    const baseline = await this.receipts.capture({
      filePaths: task.assignedFiles,
      project,
      runId: request.runId,
      sessionId: request.sessionId,
      taskId: request.taskId,
    })
    const sources = await this.files.readAll(project, task.assignedFiles)
    assertExactFiles(
      task.assignedFiles,
      sources.map((source) => source.filePath),
      'source',
    )
    assertAggregateSourceLimit(sources)
    assertSourcesMatchBaseline(sources, baseline)
    const modelStartedAt = this.clock()
    const generation = await this.model.generate({
      objective: runState.objective,
      sources: sources.map(({ content, filePath, state }) => ({
        content,
        filePath,
        state,
      })),
      task,
    })
    const usage = AxisModelUsageSchema.parse(generation.usage)
    const runStateAfterUsage = this.runStates.recordUsage({
      durationMs: Math.max(0, this.clock().getTime() - modelStartedAt.getTime()),
      expectedRevision: request.expectedRevision,
      runId: request.runId,
      sessionId: request.sessionId,
      taskId: request.taskId,
      usage,
    })
    const taskAfterUsage = runStateAfterUsage.tasks.find(
      (candidate) => candidate.taskId === request.taskId,
    )
    if (!taskAfterUsage || taskAfterUsage.status !== 'pending') {
      throw new Error(
        taskAfterUsage?.error
        ?? `Axis safe-write proposal task is no longer pending: ${request.taskId}`,
      )
    }
    const output = AxisSafeWriteProposalModelOutputSchema.parse(generation.output)
    assertExactFiles(
      task.assignedFiles,
      output.writes.map((write) => write.filePath),
      'model',
    )
    const writesByPath = new Map(
      output.writes.map((write) => [write.filePath, write]),
    )
    const proposal: AxisSafeWriteProposal = AxisSafeWriteProposalSchema.parse({
      createdAt: this.clock().toISOString(),
      expectedRevision: runStateAfterUsage.revision,
      files: sources.map((source) => ({
        filePath: source.filePath,
        originalContent: source.content,
        originalSha256: source.sha256,
        originalState: source.state,
        proposedContent: writesByPath.get(source.filePath)!.content,
      })),
      proposalId: this.idFactory(),
      runId: request.runId,
      sessionId: request.sessionId,
      taskId: request.taskId,
      usage,
    })
    const receipt = await this.receipts.issue({ baseline, proposal })
    return AxisSafeWriteProposalResultSchema.parse({
      proposal,
      receipt,
      runState: runStateAfterUsage,
    })
  }
}

function assertSafeWriteTask(task: AxisTask): void {
  if (
    task.requiredTools.length !== 1
    || task.requiredTools[0] !== 'fs.safeWrite'
  ) {
    throw new Error('Axis safe-write proposal requires exactly fs.safeWrite')
  }
  if (
    task.assignedFiles.length < 1
    || task.assignedFiles.length > 16
    || new Set(task.assignedFiles).size !== task.assignedFiles.length
  ) {
    throw new Error('Axis safe-write proposal requires 1–16 unique assigned files')
  }
}

function assertExactFiles(
  assignedFiles: string[],
  actualFiles: string[],
  source: 'model' | 'source',
): void {
  const assigned = [...assignedFiles].sort()
  const actual = [...actualFiles].sort()
  if (JSON.stringify(assigned) !== JSON.stringify(actual)) {
    throw new Error(`Axis safe-write proposal ${source} files must exactly match assigned files`)
  }
}

function assertSourcesMatchBaseline(
  sources: AxisSafeWriteProposalSource[],
  baseline: AxisReviewedProposalBaseline,
): void {
  const evidenceByPath = new Map(
    baseline.files.map((file) => [file.filePath, file.evidence]),
  )
  if (evidenceByPath.size !== sources.length) {
    throw new Error('Axis safe-write proposal source baseline must exactly match assigned files')
  }
  for (const source of sources) {
    const evidence = evidenceByPath.get(source.filePath)
    const matches = source.state === 'missing'
      ? evidence?.state.kind === 'missing'
      : evidence?.state.kind === 'exists'
        && evidence.state.contentSha256 === source.sha256
        && evidence.state.byteLength === Buffer.byteLength(source.content, 'utf8')
    if (!evidence || !matches) {
      throw new Error(
        `Axis safe-write proposal source changed during baseline capture: ${source.filePath}`,
      )
    }
  }
}

function assertAggregateSourceLimit(
  sources: AxisSafeWriteProposalSource[],
): void {
  const contentChars = sources.reduce(
    (total, source) => total + source.content.length,
    0,
  )
  if (contentChars > AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS) {
    throw new Error(
      'Axis safe-write proposal source content exceeds the aggregate hard limit',
    )
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
