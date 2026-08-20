import { createHash } from 'node:crypto'
import { AxisPivotDispatchResultSchema } from '../../shared/axis-pivot-action-contracts'
import { AxisPivotContinuationHandoffSchema } from '../../shared/axis-pivot-failure-contracts'
import { AxisGuardedSafeWriteSubmissionResultSchema } from '../../shared/axis-guarded-safe-write-contracts'
import {
  AxisPivotGuardedContinuationRequestSchema,
  type AxisPivotGuardedContinuationAttempt,
  type AxisPivotGuardedContinuationRequest,
} from '../../shared/axis-pivot-guarded-continuation-contracts'
import type {
  AxisGuardedSafeWriteSubmissionPort,
  AxisPivotContinuationAttemptPort,
  AxisPivotContinuationAuthorization,
  AxisPivotContinuationAuthorizationPort,
  AxisPivotGuardedContinuationConsumerPort,
} from './axis-pivot-guarded-continuation-ports'

export class AxisPivotGuardedContinuationConsumer
implements AxisPivotGuardedContinuationConsumerPort {
  private readonly attempts: AxisPivotContinuationAttemptPort
  private readonly authorization: AxisPivotContinuationAuthorizationPort
  private readonly inFlight = new Map<
    string,
    Promise<AxisPivotGuardedContinuationAttempt>
  >()
  private readonly submissions: AxisGuardedSafeWriteSubmissionPort

  constructor(options: {
    attempts: AxisPivotContinuationAttemptPort
    authorization: AxisPivotContinuationAuthorizationPort
    submissions: AxisGuardedSafeWriteSubmissionPort
  }) {
    this.attempts = options.attempts
    this.authorization = options.authorization
    this.submissions = options.submissions
  }

  consume(
    input: AxisPivotGuardedContinuationRequest,
  ): Promise<AxisPivotGuardedContinuationAttempt> {
    const request = AxisPivotGuardedContinuationRequestSchema.parse(input)
    const requestSha256 = digest(request)
    const key = `${request.handoffId}\u0000${requestSha256}`
    const existing = this.inFlight.get(key)
    if (existing) return existing
    const operation = this.consumeOnce(request, requestSha256).finally(() => {
      if (this.inFlight.get(key) === operation) this.inFlight.delete(key)
    })
    this.inFlight.set(key, operation)
    return operation
  }

  private async consumeOnce(
    request: AxisPivotGuardedContinuationRequest,
    requestSha256: string,
  ): Promise<AxisPivotGuardedContinuationAttempt> {
    const authorization = this.requireAuthorization(request)
    const action = authorization.handoff.action
    if (
      action !== 'retry'
      && action !== 'replan'
      && action !== 'self-repair'
      && action !== 'dedicated-fixer'
    ) {
      throw new Error(
        `Axis Pivot ${action} continuation requires authoritative task scheduling before Guarded submission`,
      )
    }
    if (
      (action === 'self-repair' || action === 'dedicated-fixer')
      && (
        authorization.dispatch.result.action !== action
        || authorization.dispatch.result.schemaVersion !== 2
      )
    ) {
      throw new Error(
        `Axis Pivot ${action} continuation requires authoritative task scheduling before Guarded submission`,
      )
    }
    this.requireSubmissionTarget(request, authorization)

    const existing = this.attempts.findByRequest(
      request.handoffId,
      requestSha256,
    )
    if (existing) return requireReusable(existing)

    const receipt = request.submission.reviewedProposalReceipt
    const begun = this.attempts.begin({
      action,
      decisionId: request.decisionId,
      handoffId: request.handoffId,
      proposalId: receipt.proposalId,
      requestSha256,
      reviewedProposalReceiptId: receipt.receiptId,
      sessionId: authorization.handoff.sessionId,
      sourceRunId: authorization.handoff.runId,
      submittedTaskId: request.submission.taskId,
      targetRunId: authorization.handoff.targetRunId,
    })
    if (!begun.created) return requireReusable(begun.attempt)
    const attempt = begun.attempt

    let result
    try {
      result = AxisGuardedSafeWriteSubmissionResultSchema.parse(
        await this.submissions.submit(request.submission),
      )
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Axis guarded continuation submission failed'
      this.attempts.fail({
        attemptId: attempt.attemptId,
        error: message,
        expectedRevision: attempt.revision,
      })
      throw error
    }

    return this.attempts.complete({
      attemptId: attempt.attemptId,
      expectedRevision: attempt.revision,
      result,
    })
  }

  private requireAuthorization(
    request: AxisPivotGuardedContinuationRequest,
  ): AxisPivotContinuationAuthorization {
    const found = this.authorization.find(request.decisionId)
    if (!found) {
      throw new Error(
        `Axis Pivot continuation authorization not found: ${request.decisionId}`,
      )
    }
    const handoff = AxisPivotContinuationHandoffSchema.parse(found.handoff)
    const dispatch = AxisPivotDispatchResultSchema.parse(found.dispatch)
    if (
      handoff.decisionId !== request.decisionId
      || handoff.handoffId !== request.handoffId
      || dispatch.decisionId !== request.decisionId
      || dispatch.executionRevision !== handoff.executionRevision
      || dispatch.runId !== handoff.runId
      || dispatch.sessionId !== handoff.sessionId
      || dispatch.route !== 'continuation'
      || dispatch.result.action !== handoff.action
    ) {
      throw new Error(
        'Axis Pivot continuation handoff does not match its committed dispatch',
      )
    }
    return { dispatch, handoff }
  }

  private requireSubmissionTarget(
    request: AxisPivotGuardedContinuationRequest,
    authorization: AxisPivotContinuationAuthorization,
  ): void {
    const { handoff, dispatch } = authorization
    const submission = request.submission
    if (
      submission.runId !== handoff.targetRunId
      || submission.sessionId !== handoff.sessionId
    ) {
      throw new Error(
        'Axis Pivot guarded continuation submission ownership mismatch',
      )
    }
    if (
      handoff.action === 'retry'
      && dispatch.result.action === 'retry'
      && submission.taskId !== dispatch.result.taskId
    ) {
      throw new Error(
        'Axis Pivot retry continuation must submit its decision-owned task',
      )
    }
    if (
      handoff.action === 'replan'
      && dispatch.result.action === 'replan'
      && dispatch.result.lineage.childRunId !== submission.runId
    ) {
      throw new Error(
        'Axis Pivot replan continuation must submit a task from its child Run',
      )
    }
    if (
      (handoff.action === 'self-repair' || handoff.action === 'dedicated-fixer')
      && dispatch.result.action === handoff.action
    ) {
      if (dispatch.result.schemaVersion !== 2) {
        throw new Error(
          `Axis Pivot ${handoff.action} continuation requires authoritative task scheduling before Guarded submission`,
        )
      }
      if (
        submission.taskId !== dispatch.result.taskId
        || submission.expectedRevision !== dispatch.result.stateRevision + 1
      ) {
        throw new Error(
          `Axis Pivot ${handoff.action} continuation must submit its scheduled task at the next reviewed revision`,
        )
      }
    }
  }
}

function digest(request: AxisPivotGuardedContinuationRequest): string {
  return createHash('sha256')
    .update(JSON.stringify(request), 'utf8')
    .digest('hex')
}

function requireReusable(
  attempt: AxisPivotGuardedContinuationAttempt,
): AxisPivotGuardedContinuationAttempt {
  if (attempt.status === 'completed') return attempt
  if (attempt.status === 'failed') {
    throw new Error(
      `Axis Pivot guarded continuation request already failed: ${attempt.error}`,
    )
  }
  if (attempt.status === 'recovery-required') {
    throw new Error(attempt.error ?? 'Guarded continuation requires recovery')
  }
  throw new Error(
    'Axis Pivot guarded continuation request is already submitting',
  )
}
