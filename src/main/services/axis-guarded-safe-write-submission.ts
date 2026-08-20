import {
  AxisGuardedSafeWriteSubmissionSchema,
  AxisGuardedSafeWriteSubmissionResultSchema,
  type AxisGuardedSafeWriteSubmission,
  type AxisGuardedSafeWriteSubmissionResult,
} from '../../shared/axis-guarded-safe-write-contracts'
import {
  AxisGuardedSafeWriteResultSchema,
  WorkerResultSchema,
  type AxisGuardedSafeWriteResult,
  type WorkerResult,
} from '../../shared/axis-engine-contracts'
import type {
  AxisGuardedRunStatePort,
  AxisGuardedSafeWriteExecutionPort,
  AxisGuardedTaskReaderPort,
} from './axis-guarded-safe-write-ports'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import type { AxisReviewedProposalReceiptVerifierPort } from './axis-reviewed-proposal-ports'

export class AxisGuardedSafeWriteSubmissionService {
  private readonly execution: AxisGuardedSafeWriteExecutionPort | null
  private readonly projects: AxisProjectBindingReaderPort
  private readonly reviewedProposals: AxisReviewedProposalReceiptVerifierPort
  private readonly runStates: AxisGuardedRunStatePort
  private readonly tasks: AxisGuardedTaskReaderPort

  constructor(options: {
    execution: AxisGuardedSafeWriteExecutionPort | null
    projects: AxisProjectBindingReaderPort
    reviewedProposals: AxisReviewedProposalReceiptVerifierPort
    runStates: AxisGuardedRunStatePort
    tasks: AxisGuardedTaskReaderPort
  }) {
    this.execution = options.execution
    this.projects = options.projects
    this.reviewedProposals = options.reviewedProposals
    this.runStates = options.runStates
    this.tasks = options.tasks
  }

  async submit(
    input: AxisGuardedSafeWriteSubmission,
  ): Promise<AxisGuardedSafeWriteSubmissionResult> {
    const request = AxisGuardedSafeWriteSubmissionSchema.parse(input)
    if (!this.execution) {
      throw new Error('Axis guarded safe-write execution is disabled')
    }
    const task = this.tasks.findTask(request)
    if (!task) {
      throw new Error(
        `Axis guarded safe-write task not found for run ${request.runId} and session ${request.sessionId}`,
      )
    }
    const project = this.projects.findBySession(request.sessionId)
    if (!project) {
      throw new Error(`Axis project binding not found for session ${request.sessionId}`)
    }
    if (
      task.requiredTools.length !== 1
      || task.requiredTools[0] !== 'fs.safeWrite'
    ) {
      throw new Error('Axis guarded safe-write tasks must require exactly fs.safeWrite')
    }
    if (!sameValues(
      task.assignedFiles,
      request.writes.map((write) => write.filePath),
    )) {
      throw new Error('Axis guarded safe-write payload must exactly match the task assigned files')
    }

    const reviewedProposal = await this.reviewedProposals.verify({
      expectedRevision: request.expectedRevision,
      project,
      receipt: request.reviewedProposalReceipt,
      runId: request.runId,
      sessionId: request.sessionId,
      taskId: request.taskId,
      writes: request.writes,
    })
    const claimed = this.runStates.claimTask({
      dependencyTaskIds: task.dependencies,
      expectedRevision: request.expectedRevision,
      runId: request.runId,
      sessionId: request.sessionId,
      taskId: request.taskId,
    })
    const startedAt = Date.now()
    let execution: AxisGuardedSafeWriteResult
    try {
      execution = AxisGuardedSafeWriteResultSchema.parse(
        await this.execution.execute({
          projectRoot: project.projectRoot,
          reviewedProposal,
          runId: request.runId,
          sessionId: request.sessionId,
          task,
          writes: request.writes,
        }),
      )
    } catch (error) {
      this.runStates.finishTask({
        expectedRevision: claimed.revision,
        result: executionFailureResult(
          request.taskId,
          error,
          Date.now() - startedAt,
        ),
        runId: request.runId,
        sessionId: request.sessionId,
      })
      throw error
    }
    const runState = this.runStates.finishTask({
      expectedRevision: claimed.revision,
      result: workerResult(execution, Date.now() - startedAt),
      runId: request.runId,
      sessionId: request.sessionId,
    })
    return AxisGuardedSafeWriteSubmissionResultSchema.parse({
      execution,
      runState,
    })
  }
}

function workerResult(
  execution: AxisGuardedSafeWriteResult,
  durationMs: number,
): WorkerResult {
  return WorkerResultSchema.parse({
    artifacts: execution.writeReceipts.map((receipt) => ({
      id: receipt.envelopeId,
      path: receipt.filePath,
      type: 'file',
    })),
    findings: execution.status === 'completed'
      ? []
      : [execution.blockReason ?? execution.status],
    status: execution.status === 'completed' ? 'completed' : 'failed',
    summary: execution.detail,
    taskId: execution.taskId,
    usage: {
      costUsd: 0,
      durationMs: Math.max(0, Math.trunc(durationMs)),
      tokens: 0,
    },
  })
}

function executionFailureResult(
  taskId: string,
  error: unknown,
  durationMs: number,
): WorkerResult {
  return WorkerResultSchema.parse({
    artifacts: [],
    findings: ['execution-error'],
    status: 'failed',
    summary: error instanceof Error ? error.message : 'Guarded execution failed',
    taskId,
    usage: {
      costUsd: 0,
      durationMs: Math.max(0, Math.trunc(durationMs)),
      tokens: 0,
    },
  })
}

function sameValues(left: string[], right: string[]): boolean {
  return new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}
