import type { AxisSafeWriteProposalRequest, AxisSafeWriteProposalResult } from '../../shared/axis-safe-write-proposal-contracts'
import type {
  AxisPivotReviewedContinuationOrchestration,
  AxisPivotReviewedContinuationRequest,
} from '../../shared/axis-pivot-reviewed-continuation-contracts'
import type { AxisPivotGuardedContinuationAttempt } from '../../shared/axis-pivot-guarded-continuation-contracts'

export interface AxisSafeWriteProposalPort {
  propose(request: AxisSafeWriteProposalRequest): Promise<AxisSafeWriteProposalResult>
}

export interface AxisPivotReviewedContinuationBeginInput {
  action: 'retry' | 'self-repair' | 'dedicated-fixer'
  decisionId: string
  handoffId: string
  sessionId: string
  sourceRunId: string
  submittedTaskId: string
  targetRunId: string
}

export interface AxisPivotReviewedContinuationBeginResult {
  created: boolean
  orchestration: AxisPivotReviewedContinuationOrchestration
}

export interface AxisPivotReviewedContinuationTransition {
  expectedRevision: number
  orchestrationId: string
}

export interface AxisPivotReviewedContinuationAttemptPort {
  begin(
    input: AxisPivotReviewedContinuationBeginInput,
  ): AxisPivotReviewedContinuationBeginResult
  complete(
    input: AxisPivotReviewedContinuationTransition & {
      continuationAttempt: AxisPivotGuardedContinuationAttempt
    },
  ): AxisPivotReviewedContinuationOrchestration
  fail(
    input: AxisPivotReviewedContinuationTransition & { error: string },
  ): AxisPivotReviewedContinuationOrchestration
  findByDecision(
    decisionId: string,
  ): AxisPivotReviewedContinuationOrchestration | null
  markSubmitting(
    input: AxisPivotReviewedContinuationTransition & {
      proposalResult: AxisSafeWriteProposalResult
    },
  ): AxisPivotReviewedContinuationOrchestration
}

export interface AxisPivotReviewedContinuationOrchestratorPort {
  orchestrate(
    request: AxisPivotReviewedContinuationRequest,
  ): Promise<AxisPivotReviewedContinuationOrchestration>
}
