import { AxisPivotDispatchResultSchema } from '../../shared/axis-pivot-action-contracts'
import { AxisPivotContinuationHandoffSchema } from '../../shared/axis-pivot-failure-contracts'
import { AxisPivotGuardedContinuationAttemptSchema } from '../../shared/axis-pivot-guarded-continuation-contracts'
import type { AxisPivotReplanTaskSchedule } from '../../shared/axis-pivot-replan-task-scheduling-contracts'
import {
  AxisPivotReplanReviewedTaskRequestSchema,
  type AxisPivotReplanReviewedTaskOrchestration,
  type AxisPivotReplanReviewedTaskRequest,
} from '../../shared/axis-pivot-replan-reviewed-task-contracts'
import { AxisSafeWriteProposalResultSchema } from '../../shared/axis-safe-write-proposal-contracts'
import type {
  AxisPivotContinuationAuthorization,
  AxisPivotContinuationAuthorizationPort,
  AxisPivotGuardedContinuationConsumerPort,
} from './axis-pivot-guarded-continuation-ports'
import type {
  AxisPivotReplanReviewedTaskAttemptPort,
  AxisPivotReplanReviewedTaskOrchestratorPort,
} from './axis-pivot-replan-reviewed-task-ports'
import type { AxisPivotReplanTaskScheduleReaderPort } from './axis-pivot-replan-task-scheduling-ports'
import type { AxisSafeWriteProposalPort } from './axis-pivot-reviewed-continuation-ports'

export class AxisPivotReplanReviewedTaskOrchestrator
implements AxisPivotReplanReviewedTaskOrchestratorPort {
  private readonly inFlight = new Map<string, Promise<AxisPivotReplanReviewedTaskOrchestration>>()
  constructor(private readonly options: {
    authorization: AxisPivotContinuationAuthorizationPort
    continuations: AxisPivotGuardedContinuationConsumerPort
    orchestrations: AxisPivotReplanReviewedTaskAttemptPort
    proposals: AxisSafeWriteProposalPort
    schedules: AxisPivotReplanTaskScheduleReaderPort
  }) {}

  orchestrate(input: AxisPivotReplanReviewedTaskRequest) {
    const request = AxisPivotReplanReviewedTaskRequestSchema.parse(input)
    const existing = this.inFlight.get(request.scheduleId)
    if (existing) return existing
    const operation = this.orchestrateOnce(request).finally(() => {
      if (this.inFlight.get(request.scheduleId) === operation) this.inFlight.delete(request.scheduleId)
    })
    this.inFlight.set(request.scheduleId, operation)
    return operation
  }

  private async orchestrateOnce(request: AxisPivotReplanReviewedTaskRequest) {
    const schedule = this.options.schedules.find(request.scheduleId)
    if (!schedule) throw new Error(`Axis Pivot replan task schedule not found: ${request.scheduleId}`)
    const authorization = requireAuthorization(schedule, this.options.authorization)
    const existing = this.options.orchestrations.findBySchedule(schedule.scheduleId)
    if (existing) return requireReusable(existing)
    const begun = this.options.orchestrations.begin({
      childStateRevision: schedule.childStateRevision,
      decisionId: schedule.decisionId,
      handoffId: schedule.handoffId,
      scheduleId: schedule.scheduleId,
      sessionId: schedule.sessionId,
      sourceRunId: schedule.parentRunId,
      submittedTaskId: schedule.taskId,
      targetRunId: schedule.childRunId,
    })
    if (!begun.created) return requireReusable(begun.orchestration)
    const preparing = begun.orchestration
    let proposalResult
    try {
      proposalResult = AxisSafeWriteProposalResultSchema.parse(await this.options.proposals.propose({
        expectedRevision: schedule.childStateRevision,
        runId: schedule.childRunId,
        sessionId: schedule.sessionId,
        taskId: schedule.taskId,
      }))
      if (
        proposalResult.proposal.runId !== schedule.childRunId
        || proposalResult.proposal.sessionId !== schedule.sessionId
        || proposalResult.proposal.taskId !== schedule.taskId
        || proposalResult.proposal.expectedRevision !== schedule.childStateRevision + 1
      ) throw new Error('Axis Pivot replan reviewed proposal ownership mismatch')
    } catch (error) {
      this.options.orchestrations.fail({
        error: errorMessage(error), expectedRevision: preparing.revision,
        orchestrationId: preparing.orchestrationId,
      })
      throw error
    }
    const submitting = this.options.orchestrations.markSubmitting({
      expectedRevision: preparing.revision,
      orchestrationId: preparing.orchestrationId,
      proposalResult,
    })
    let continuationAttempt
    try {
      continuationAttempt = AxisPivotGuardedContinuationAttemptSchema.parse(
        await this.options.continuations.consume({
          decisionId: schedule.decisionId,
          handoffId: schedule.handoffId,
          submission: {
            expectedRevision: proposalResult.proposal.expectedRevision,
            reviewedProposalReceipt: proposalResult.receipt,
            runId: schedule.childRunId,
            sessionId: schedule.sessionId,
            taskId: schedule.taskId,
            writes: proposalResult.proposal.files.map(({ filePath, proposedContent }) => ({
              content: proposedContent, filePath,
            })),
          },
        }),
      )
    } catch (error) {
      this.options.orchestrations.fail({
        error: errorMessage(error), expectedRevision: submitting.revision,
        orchestrationId: submitting.orchestrationId,
      })
      throw error
    }
    return this.options.orchestrations.complete({
      continuationAttempt,
      expectedRevision: submitting.revision,
      orchestrationId: submitting.orchestrationId,
    })
  }
}

function requireAuthorization(
  schedule: AxisPivotReplanTaskSchedule,
  port: AxisPivotContinuationAuthorizationPort,
): AxisPivotContinuationAuthorization {
  const found = port.find(schedule.decisionId)
  if (!found) throw new Error(`Axis Pivot continuation authorization not found: ${schedule.decisionId}`)
  const dispatch = AxisPivotDispatchResultSchema.parse(found.dispatch)
  const handoff = AxisPivotContinuationHandoffSchema.parse(found.handoff)
  if (
    dispatch.decisionId !== schedule.decisionId
    || dispatch.route !== 'continuation'
    || dispatch.result.action !== 'replan'
    || handoff.action !== 'replan'
    || handoff.decisionId !== schedule.decisionId
    || handoff.handoffId !== schedule.handoffId
    || handoff.runId !== schedule.parentRunId
    || handoff.targetRunId !== schedule.childRunId
    || handoff.sessionId !== schedule.sessionId
    || handoff.executionRevision !== schedule.executionRevision
    || dispatch.result.lineage.attemptId !== schedule.lineageAttemptId
  ) throw new Error('Axis Pivot replan reviewed task requires exact schedule authorization')
  return { dispatch, handoff }
}
function requireReusable(value: AxisPivotReplanReviewedTaskOrchestration) {
  if (value.status === 'completed') return value
  if (value.status === 'failed' || value.status === 'recovery-required') {
    throw new Error(value.error ?? `Axis Pivot replan reviewed task is ${value.status}`)
  }
  throw new Error(`Axis Pivot replan reviewed task is already ${value.status}`)
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Axis Pivot replan reviewed task failed'
}
