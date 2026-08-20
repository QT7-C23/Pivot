import { AxisPivotDispatchResultSchema } from '../../shared/axis-pivot-action-contracts'
import { AxisPivotContinuationHandoffSchema } from '../../shared/axis-pivot-failure-contracts'
import { AxisPivotGuardedContinuationAttemptSchema } from '../../shared/axis-pivot-guarded-continuation-contracts'
import {
  AxisPivotReviewedContinuationRequestSchema,
  type AxisPivotReviewedContinuationOrchestration,
  type AxisPivotReviewedContinuationRequest,
} from '../../shared/axis-pivot-reviewed-continuation-contracts'
import { AxisSafeWriteProposalResultSchema } from '../../shared/axis-safe-write-proposal-contracts'
import type {
  AxisPivotContinuationAuthorization,
  AxisPivotContinuationAuthorizationPort,
  AxisPivotGuardedContinuationConsumerPort,
} from './axis-pivot-guarded-continuation-ports'
import type {
  AxisPivotReviewedContinuationAttemptPort,
  AxisPivotReviewedContinuationOrchestratorPort,
  AxisSafeWriteProposalPort,
} from './axis-pivot-reviewed-continuation-ports'

export class AxisPivotReviewedContinuationOrchestrator
implements AxisPivotReviewedContinuationOrchestratorPort {
  private readonly authorization: AxisPivotContinuationAuthorizationPort
  private readonly continuations: AxisPivotGuardedContinuationConsumerPort
  private readonly inFlight = new Map<
    string,
    Promise<AxisPivotReviewedContinuationOrchestration>
  >()
  private readonly orchestrations: AxisPivotReviewedContinuationAttemptPort
  private readonly proposals: AxisSafeWriteProposalPort

  constructor(options: {
    authorization: AxisPivotContinuationAuthorizationPort
    continuations: AxisPivotGuardedContinuationConsumerPort
    orchestrations: AxisPivotReviewedContinuationAttemptPort
    proposals: AxisSafeWriteProposalPort
  }) {
    this.authorization = options.authorization
    this.continuations = options.continuations
    this.orchestrations = options.orchestrations
    this.proposals = options.proposals
  }

  orchestrate(
    input: AxisPivotReviewedContinuationRequest,
  ): Promise<AxisPivotReviewedContinuationOrchestration> {
    const request = AxisPivotReviewedContinuationRequestSchema.parse(input)
    const existing = this.inFlight.get(request.decisionId)
    if (existing) return existing
    const operation = this.orchestrateOnce(request).finally(() => {
      if (this.inFlight.get(request.decisionId) === operation) {
        this.inFlight.delete(request.decisionId)
      }
    })
    this.inFlight.set(request.decisionId, operation)
    return operation
  }

  private async orchestrateOnce(
    request: AxisPivotReviewedContinuationRequest,
  ): Promise<AxisPivotReviewedContinuationOrchestration> {
    const authorization = this.requireScheduledAuthorization(request.decisionId)
    const { dispatch, handoff } = authorization
    const scheduled = requireScheduledResult(dispatch.result)
    const existing = this.orchestrations.findByDecision(request.decisionId)
    if (existing) return requireReusable(existing)

    const begun = this.orchestrations.begin({
      action: scheduled.action,
      decisionId: request.decisionId,
      handoffId: handoff.handoffId,
      sessionId: handoff.sessionId,
      sourceRunId: handoff.runId,
      submittedTaskId: scheduled.taskId,
      targetRunId: handoff.targetRunId,
    })
    if (!begun.created) return requireReusable(begun.orchestration)
    const preparing = begun.orchestration

    let proposalResult
    try {
      proposalResult = AxisSafeWriteProposalResultSchema.parse(
        await this.proposals.propose({
          expectedRevision: scheduled.stateRevision,
          runId: handoff.targetRunId,
          sessionId: handoff.sessionId,
          taskId: scheduled.taskId,
        }),
      )
      requireProposalOwnership(proposalResult, authorization)
    } catch (error) {
      this.orchestrations.fail({
        error: errorMessage(error, 'Axis reviewed continuation proposal failed'),
        expectedRevision: preparing.revision,
        orchestrationId: preparing.orchestrationId,
      })
      throw error
    }

    const submitting = this.orchestrations.markSubmitting({
      expectedRevision: preparing.revision,
      orchestrationId: preparing.orchestrationId,
      proposalResult,
    })
    let continuationAttempt
    try {
      continuationAttempt = AxisPivotGuardedContinuationAttemptSchema.parse(
        await this.continuations.consume({
          decisionId: request.decisionId,
          handoffId: handoff.handoffId,
          submission: {
            expectedRevision: proposalResult.proposal.expectedRevision,
            reviewedProposalReceipt: proposalResult.receipt,
            runId: proposalResult.proposal.runId,
            sessionId: proposalResult.proposal.sessionId,
            taskId: proposalResult.proposal.taskId,
            writes: proposalResult.proposal.files.map((file) => ({
              content: file.proposedContent,
              filePath: file.filePath,
            })),
          },
        }),
      )
    } catch (error) {
      this.orchestrations.fail({
        error: errorMessage(error, 'Axis reviewed continuation submission failed'),
        expectedRevision: submitting.revision,
        orchestrationId: submitting.orchestrationId,
      })
      throw error
    }
    return this.orchestrations.complete({
      continuationAttempt,
      expectedRevision: submitting.revision,
      orchestrationId: submitting.orchestrationId,
    })
  }

  private requireScheduledAuthorization(
    decisionId: string,
  ): AxisPivotContinuationAuthorization {
    const found = this.authorization.find(decisionId)
    if (!found) {
      throw new Error(`Axis Pivot continuation authorization not found: ${decisionId}`)
    }
    const handoff = AxisPivotContinuationHandoffSchema.parse(found.handoff)
    const dispatch = AxisPivotDispatchResultSchema.parse(found.dispatch)
    if (
      handoff.decisionId !== decisionId
      || dispatch.decisionId !== decisionId
      || dispatch.route !== 'continuation'
      || (dispatch.result.action !== 'retry'
        && dispatch.result.action !== 'self-repair'
        && dispatch.result.action !== 'dedicated-fixer')
      || handoff.action !== dispatch.result.action
      || handoff.runId !== dispatch.runId
      || handoff.sessionId !== dispatch.sessionId
      || handoff.executionRevision !== dispatch.executionRevision
      || handoff.targetRunId !== dispatch.result.runId
    ) {
      throw new Error(
        'Axis Pivot reviewed continuation requires an exact committed scheduled handoff',
      )
    }
    requireScheduledResult(dispatch.result)
    return { dispatch, handoff }
  }
}

function requireProposalOwnership(
  result: ReturnType<typeof AxisSafeWriteProposalResultSchema.parse>,
  authorization: AxisPivotContinuationAuthorization,
): void {
  const dispatch = authorization.dispatch
  const scheduled = requireScheduledResult(dispatch.result)
  if (
    result.proposal.runId !== authorization.handoff.targetRunId
    || result.proposal.sessionId !== authorization.handoff.sessionId
    || result.proposal.taskId !== scheduled.taskId
    || result.proposal.expectedRevision !== scheduled.stateRevision + 1
  ) {
    throw new Error('Axis reviewed continuation proposal ownership mismatch')
  }
}

function requireScheduledResult(
  result: AxisPivotContinuationAuthorization['dispatch']['result'],
) {
  if (result.action === 'retry') return result
  if (
    (result.action === 'self-repair' || result.action === 'dedicated-fixer')
    && result.schemaVersion === 2
  ) return result
  throw new Error(
    `Axis Pivot ${result.action} continuation requires authoritative task scheduling before reviewed execution`,
  )
}

function requireReusable(
  orchestration: AxisPivotReviewedContinuationOrchestration,
): AxisPivotReviewedContinuationOrchestration {
  if (orchestration.status === 'completed') return orchestration
  if (orchestration.status === 'failed') {
    throw new Error(
      `Axis Pivot reviewed continuation already failed: ${orchestration.error}`,
    )
  }
  if (orchestration.status === 'recovery-required') {
    throw new Error(
      orchestration.error ?? 'Axis Pivot reviewed continuation requires recovery',
    )
  }
  throw new Error(
    `Axis Pivot reviewed continuation is already ${orchestration.status}`,
  )
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
