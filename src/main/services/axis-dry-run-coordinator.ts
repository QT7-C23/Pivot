import {
  AxisDryRunApprovalRequestSchema,
  AxisCheckpointEvaluationSchema,
  AxisPermissionEvaluationSchema,
  AxisReviewEvaluationSchema,
  AxisShadowRunResultSchema,
  WorkerResultSchema,
  type AxisDryRunApprovalRequest,
  type AxisCheckpointEvaluation,
  type AxisPermissionEvaluation,
  type AxisReviewEvaluation,
  type AxisRunState,
  type AxisRunStateTransitionRequest,
  type AxisShadowRunResult,
  type WorkerResult,
} from '../../shared/axis-engine-contracts'
import { evaluateAxisBudget } from './axis-budget-guard'
import { buildDagSchedule } from './axis-dag-scheduler'
import type {
  AxisRunPauseRequest,
  AxisCheckpointEvaluationRequest,
  AxisPermissionEvaluationRequest,
  AxisReviewEvaluationRequest,
  AxisTaskCompletionRequest,
  AxisTaskStateTransitionRequest,
} from './axis-run-state-registry'
import type { AxisTaskExecutor } from './axis-task-executor'
import type { AxisExecutionQualityEvaluator } from './axis-execution-quality'

export interface AxisDryRunStateStore {
  completeRun(request: AxisRunStateTransitionRequest): AxisRunState
  completeTask(request: AxisTaskCompletionRequest): AxisRunState
  get(runId: string): AxisRunState | null
  pause(request: AxisRunPauseRequest): AxisRunState
  recordCheckpoint(request: AxisCheckpointEvaluationRequest): AxisRunState
  recordPermission(request: AxisPermissionEvaluationRequest): AxisRunState
  recordReview(request: AxisReviewEvaluationRequest): AxisRunState
  startDryRun(request: AxisDryRunApprovalRequest): AxisRunState
  startTask(request: AxisTaskStateTransitionRequest): AxisRunState
}

export class AxisDryRunCoordinator {
  private readonly executor: AxisTaskExecutor
  private readonly quality: AxisExecutionQualityEvaluator
  private readonly states: AxisDryRunStateStore

  constructor(options: { executor: AxisTaskExecutor; quality: AxisExecutionQualityEvaluator; states: AxisDryRunStateStore }) {
    this.executor = options.executor
    this.quality = options.quality
    this.states = options.states
  }

  async execute(planInput: AxisShadowRunResult, approvalInput: AxisDryRunApprovalRequest): Promise<AxisRunState> {
    const plan = AxisShadowRunResultSchema.parse(planInput)
    const approval = AxisDryRunApprovalRequestSchema.parse(approvalInput)
    if (plan.status !== 'planned' || !plan.dag || !plan.schedule || !plan.complexity) {
      throw new Error('Axis dry run requires a completed Shadow plan')
    }
    if (plan.trace.runId !== approval.runId || plan.trace.sessionId !== approval.sessionId) {
      throw new Error('Axis dry-run approval does not own this plan')
    }
    const initial = this.states.get(approval.runId)
    if (!initial || initial.sessionId !== approval.sessionId) throw new Error(`Axis run state not found: ${approval.runId}`)
    const schedule = buildDagSchedule(plan.dag, Math.min(initial.budget.maxWorkers, plan.complexity.suggestedWorkers))
    if (JSON.stringify(schedule) !== JSON.stringify(plan.schedule)) throw new Error('Persisted Axis schedule does not match its DAG')

    let state = this.states.startDryRun(approval)
    const beforeExecution = evaluateAxisBudget(state.budget, state.usage)
    if (!beforeExecution.allowed) {
      return this.states.pause(revisionRequest(state, { stopReason: beforeExecution.stopReason! }))
    }
    for (const batch of schedule.batches) {
      for (const taskId of batch) {
        const task = plan.dag.tasks.find((candidate) => candidate.id === taskId)
        if (!task) throw new Error(`Scheduled Axis task not found: ${taskId}`)
        let taskComplete = false
        while (!taskComplete) {
          let latest = this.requireRunnableState(approval.runId)
          if (latest.status !== 'running') return latest
          const qualityInput = { runId: latest.runId, sessionId: latest.sessionId, task }
          const permission = await this.safePermissionEvaluation(qualityInput)
          latest = this.requireRunnableState(approval.runId)
          if (latest.status !== 'running') return latest
          state = this.states.recordPermission(revisionRequest(latest, { evaluation: permission }))
          if (state.status === 'failed') return state

          const checkpoint = await this.safeCheckpointEvaluation(qualityInput)
          latest = this.requireRunnableState(approval.runId)
          if (latest.status !== 'running') return latest
          state = this.states.recordCheckpoint(revisionRequest(latest, { evaluation: checkpoint }))
          if (state.status === 'failed') return state

          state = this.states.startTask(revisionRequest(state, { taskId }))
          let result: WorkerResult
          try {
            result = WorkerResultSchema.parse(await this.executor.execute({ mode: 'dry-run', runId: state.runId, sessionId: state.sessionId, task }))
            if (result.taskId !== taskId) throw new Error('Executor result does not match the scheduled task contract')
          } catch (error) {
            result = {
              artifacts: [], findings: [], status: 'failed',
              summary: error instanceof Error ? error.message : String(error),
              taskId, usage: { costUsd: 0, durationMs: 0, tokens: 0 },
            }
          }
          const afterExecution = this.requireState(approval.runId)
          if (afterExecution.status === 'cancelled') return afterExecution
          state = this.states.completeTask(revisionRequest(afterExecution, { result }))
          if (state.status === 'failed' || state.status === 'cancelled') return state
          let budget = evaluateAxisBudget(state.budget, state.usage)
          if (!budget.allowed) return this.states.pause(revisionRequest(state, { stopReason: budget.stopReason! }))

          const completedTask = state.tasks.find((candidate) => candidate.taskId === taskId)!
          const review = await this.safeReviewEvaluation({ ...qualityInput, attempt: completedTask.attempts, result })
          latest = this.requireRunnableState(approval.runId)
          if (latest.status !== 'running') return latest
          state = this.states.recordReview(revisionRequest(latest, { evaluation: review }))
          if (state.status === 'failed') return state
          budget = evaluateAxisBudget(state.budget, state.usage)
          if (!budget.allowed) return this.states.pause(revisionRequest(state, { stopReason: budget.stopReason! }))
          taskComplete = state.tasks.find((candidate) => candidate.taskId === taskId)?.status === 'completed'
        }
      }
    }
    return this.states.completeRun(revisionRequest(state))
  }

  private requireState(runId: string): AxisRunState {
    const state = this.states.get(runId)
    if (!state) throw new Error(`Axis run state not found: ${runId}`)
    return state
  }

  private requireRunnableState(runId: string): AxisRunState {
    const state = this.requireState(runId)
    if (state.status === 'cancelled' || state.status === 'paused' || state.status === 'failed') return state
    if (state.status !== 'running') throw new Error(`Axis dry run is not runnable: ${state.status}`)
    return state
  }

  private async safePermissionEvaluation(input: Parameters<AxisExecutionQualityEvaluator['evaluatePermission']>[0]): Promise<AxisPermissionEvaluation> {
    try {
      const evaluation = AxisPermissionEvaluationSchema.parse(await this.quality.evaluatePermission(input))
      if (evaluation.taskId !== input.task.id || !sameValues(evaluation.requestedTools, input.task.requiredTools)) {
        throw new Error('Permission evaluation does not match the scheduled task contract')
      }
      return evaluation
    } catch (error) {
      return { authority: 'simulation', evidence: [errorMessage(error)], requestedTools: input.task.requiredTools, status: 'denied', taskId: input.task.id }
    }
  }

  private async safeCheckpointEvaluation(input: Parameters<AxisExecutionQualityEvaluator['evaluateCheckpoint']>[0]): Promise<AxisCheckpointEvaluation> {
    try {
      const evaluation = AxisCheckpointEvaluationSchema.parse(await this.quality.evaluateCheckpoint(input))
      if (evaluation.taskId !== input.task.id || !sameValues(evaluation.filePaths, input.task.assignedFiles)) {
        throw new Error('Checkpoint evaluation does not match the scheduled task contract')
      }
      return evaluation
    } catch (error) {
      return { authority: 'simulation', checkpointIds: [], evidence: [errorMessage(error)], filePaths: input.task.assignedFiles, status: 'failed', taskId: input.task.id }
    }
  }

  private async safeReviewEvaluation(input: Parameters<AxisExecutionQualityEvaluator['review']>[0]): Promise<AxisReviewEvaluation> {
    try {
      const evaluation = AxisReviewEvaluationSchema.parse(await this.quality.review(input))
      if (evaluation.taskId !== input.task.id) throw new Error('Review evaluation does not match the scheduled task contract')
      return evaluation
    } catch (error) {
      return {
        authority: 'simulation', gates: [{ durationMs: 0, evidence: [errorMessage(error)], gate: 'correctness', status: 'failed', taskId: input.task.id }],
        status: 'failed', summary: errorMessage(error), taskId: input.task.id,
      }
    }
  }
}

function revisionRequest<T extends object>(state: AxisRunState, extra?: T): AxisRunStateTransitionRequest & T {
  return { expectedRevision: state.revision, runId: state.runId, sessionId: state.sessionId, ...(extra ?? {} as T) }
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000) || 'Unknown Axis quality evaluation error'
}

function sameValues(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}
