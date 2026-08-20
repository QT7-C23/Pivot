import type { AxisPivotGuardedContinuationAttempt } from '../../shared/axis-pivot-guarded-continuation-contracts'
import type {
  AxisPivotReplanReviewedTaskOrchestration,
  AxisPivotReplanReviewedTaskRequest,
} from '../../shared/axis-pivot-replan-reviewed-task-contracts'
import type { AxisSafeWriteProposalResult } from '../../shared/axis-safe-write-proposal-contracts'

export interface AxisPivotReplanReviewedTaskBeginInput {
  childStateRevision: number
  decisionId: string
  handoffId: string
  scheduleId: string
  sessionId: string
  sourceRunId: string
  submittedTaskId: string
  targetRunId: string
}

export interface AxisPivotReplanReviewedTaskTransition {
  expectedRevision: number
  orchestrationId: string
}

export interface AxisPivotReplanReviewedTaskAttemptPort {
  begin(input: AxisPivotReplanReviewedTaskBeginInput): {
    created: boolean
    orchestration: AxisPivotReplanReviewedTaskOrchestration
  }
  complete(input: AxisPivotReplanReviewedTaskTransition & {
    continuationAttempt: AxisPivotGuardedContinuationAttempt
  }): AxisPivotReplanReviewedTaskOrchestration
  fail(input: AxisPivotReplanReviewedTaskTransition & {
    error: string
  }): AxisPivotReplanReviewedTaskOrchestration
  findBySchedule(scheduleId: string): AxisPivotReplanReviewedTaskOrchestration | null
  markSubmitting(input: AxisPivotReplanReviewedTaskTransition & {
    proposalResult: AxisSafeWriteProposalResult
  }): AxisPivotReplanReviewedTaskOrchestration
}

export interface AxisPivotReplanReviewedTaskOrchestratorPort {
  orchestrate(
    request: AxisPivotReplanReviewedTaskRequest,
  ): Promise<AxisPivotReplanReviewedTaskOrchestration>
}
