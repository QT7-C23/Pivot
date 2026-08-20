import {
  AxisRunStateSchema,
  AxisTaskSchema,
  WorkerResultSchema,
} from '../../shared/axis-engine-contracts'
import { AxisWorkerAttemptLookupSchema } from '../../shared/axis-worker-attempt-contracts'
import type { AxisPivotRunStateReaderPort } from './axis-pivot-action-ports'
import type {
  AxisWorkerAttemptLifecyclePort,
} from './axis-worker-attempt-ports'
import type {
  AxisTaskExecutor,
  AxisTaskExecutorInput,
} from './axis-task-executor'

export class AxisWorkerAttemptTrackingExecutor implements AxisTaskExecutor {
  private readonly attempts: AxisWorkerAttemptLifecyclePort
  private readonly delegate: AxisTaskExecutor
  private readonly states: AxisPivotRunStateReaderPort
  private readonly workerId: string

  constructor(options: {
    attempts: AxisWorkerAttemptLifecyclePort
    delegate: AxisTaskExecutor
    states: AxisPivotRunStateReaderPort
    workerId: string
  }) {
    this.attempts = options.attempts
    this.delegate = options.delegate
    this.states = options.states
    this.workerId = AxisWorkerAttemptLookupSchema.shape.taskId.parse(
      options.workerId,
    )
  }

  async execute(input: AxisTaskExecutorInput) {
    const task = AxisTaskSchema.parse(input.task)
    const lookup = AxisWorkerAttemptLookupSchema.parse({
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: task.id,
    })
    const foundState = this.states.find({
      runId: lookup.runId,
      sessionId: lookup.sessionId,
    })
    if (!foundState) {
      throw new Error(`Axis Worker attempt Run not found: ${lookup.runId}`)
    }
    const state = AxisRunStateSchema.parse(foundState)
    const taskState = state.tasks.find(({ taskId }) => taskId === task.id)
    if (!taskState || taskState.status !== 'running') {
      throw new Error(
        `Axis Worker attempt requires an authoritative running task: ${task.id}`,
      )
    }
    if (taskState.attempts < 1) {
      throw new Error(`Axis Worker attempt number is invalid: ${task.id}`)
    }
    const attempt = this.attempts.begin({
      attempt: taskState.attempts,
      ...lookup,
      workerId: this.workerId,
    })

    let result
    try {
      result = WorkerResultSchema.parse(await this.delegate.execute({
        ...input,
        task,
      }))
      if (result.taskId !== task.id) {
        throw new Error(
          'Executor result does not match the tracked Axis task contract',
        )
      }
    } catch (error) {
      this.attempts.finish({
        attemptId: attempt.attemptId,
        error: errorMessage(error),
        expectedRevision: attempt.revision,
        ...lookup,
        status: 'failed',
        workerId: this.workerId,
      })
      throw error
    }

    this.attempts.finish({
      attemptId: attempt.attemptId,
      error: result.status === 'completed'
        ? null
        : normalizeError(result.summary),
      expectedRevision: attempt.revision,
      ...lookup,
      status: result.status,
      workerId: this.workerId,
    })
    return result
  }
}

function errorMessage(error: unknown): string {
  return normalizeError(error instanceof Error ? error.message : String(error))
}

function normalizeError(value: string): string {
  return value.trim().slice(0, 4_000) || 'Unknown Axis Worker attempt failure'
}
