import type { AxisPivotDispatchResult } from '../../shared/axis-pivot-action-contracts'
import type { AxisPivotContinuationHandoff } from '../../shared/axis-pivot-failure-contracts'
import type {
  AxisGuardedSafeWriteSubmission,
  AxisGuardedSafeWriteSubmissionResult,
} from '../../shared/axis-guarded-safe-write-contracts'
import type {
  AxisPivotGuardedContinuationAttempt,
  AxisPivotGuardedContinuationRequest,
} from '../../shared/axis-pivot-guarded-continuation-contracts'

export interface AxisPivotContinuationAuthorization {
  dispatch: AxisPivotDispatchResult
  handoff: AxisPivotContinuationHandoff
}

export interface AxisPivotContinuationAuthorizationPort {
  find(decisionId: string): AxisPivotContinuationAuthorization | null
}

export interface AxisGuardedSafeWriteSubmissionPort {
  submit(
    request: AxisGuardedSafeWriteSubmission,
  ): Promise<AxisGuardedSafeWriteSubmissionResult>
}

export interface AxisPivotContinuationAttemptBeginInput {
  action: 'replan' | 'retry' | 'self-repair' | 'dedicated-fixer'
  decisionId: string
  handoffId: string
  proposalId: string
  requestSha256: string
  reviewedProposalReceiptId: string
  sessionId: string
  sourceRunId: string
  submittedTaskId: string
  targetRunId: string
}

export interface AxisPivotContinuationAttemptTransition {
  attemptId: string
  expectedRevision: number
}

export interface AxisPivotContinuationAttemptBeginResult {
  attempt: AxisPivotGuardedContinuationAttempt
  created: boolean
}

export interface AxisPivotContinuationAttemptPort {
  begin(
    input: AxisPivotContinuationAttemptBeginInput,
  ): AxisPivotContinuationAttemptBeginResult
  complete(
    input: AxisPivotContinuationAttemptTransition & {
      result: AxisGuardedSafeWriteSubmissionResult
    },
  ): AxisPivotGuardedContinuationAttempt
  fail(
    input: AxisPivotContinuationAttemptTransition & { error: string },
  ): AxisPivotGuardedContinuationAttempt
  findByRequest(
    handoffId: string,
    requestSha256: string,
  ): AxisPivotGuardedContinuationAttempt | null
}

export interface AxisPivotGuardedContinuationConsumerPort {
  consume(
    request: AxisPivotGuardedContinuationRequest,
  ): Promise<AxisPivotGuardedContinuationAttempt>
}
