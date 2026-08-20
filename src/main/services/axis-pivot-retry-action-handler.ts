import {
  AxisPivotDecisionRecordSchema,
  AxisRunLifecycleEventSchema,
  AxisRunStateSchema,
  type AxisPivotDecisionRecord,
  type AxisRunState,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotRetryActionRequestSchema,
  AxisPivotRetryActionResultSchema,
  type AxisPivotRetryActionRequest,
  type AxisPivotRetryActionResult,
} from '../../shared/axis-pivot-action-contracts'
import type {
  AxisPivotDecisionReaderPort,
  AxisPivotRetryStatePort,
} from './axis-pivot-action-ports'

type RetryDecision = AxisPivotDecisionRecord & {
  decision: NonNullable<AxisPivotDecisionRecord['decision']> & { taskId: string }
}

export class AxisPivotRetryActionHandler {
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly states: AxisPivotRetryStatePort

  constructor(options: {
    decisions: AxisPivotDecisionReaderPort
    states: AxisPivotRetryStatePort
  }) {
    this.decisions = options.decisions
    this.states = options.states
  }

  execute(requestInput: AxisPivotRetryActionRequest): AxisPivotRetryActionResult {
    const request = AxisPivotRetryActionRequestSchema.parse(requestInput)
    const decision = this.requireDecision(
      request.decisionId,
      request.runId,
      request.sessionId,
    )
    const found = this.states.find({
      runId: request.runId,
      sessionId: request.sessionId,
    })
    if (!found) throw new Error(`Axis Pivot retry source Run not found: ${request.runId}`)
    const state = AxisRunStateSchema.parse(found)
    this.requireOwnership(state, decision)
    if (isAlreadyScheduled(state, decision, request.expectedRevision)) {
      return retryResult(decision, request.expectedRevision, state, 'already-scheduled')
    }
    requireDecisionBoundState(state, decision, request.expectedRevision)
    let next: AxisRunState
    try {
      next = AxisRunStateSchema.parse(this.states.scheduleRetry({
        decisionId: decision.decisionId,
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        taskId: decision.decision.taskId,
      }))
    } catch (error) {
      const concurrent = this.states.find({
        runId: request.runId,
        sessionId: request.sessionId,
      })
      if (concurrent) {
        const current = AxisRunStateSchema.parse(concurrent)
        this.requireOwnership(current, decision)
        if (isAlreadyScheduled(current, decision, request.expectedRevision)) {
          return retryResult(
            decision,
            request.expectedRevision,
            current,
            'already-scheduled',
          )
        }
      }
      throw error
    }
    validateScheduledState(state, next, decision)
    return retryResult(decision, state.revision, next, 'scheduled')
  }

  private requireDecision(
    decisionId: string,
    runId: string,
    sessionId: string,
  ): RetryDecision {
    const found = this.decisions.find(decisionId)
    if (!found) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
    const record = AxisPivotDecisionRecordSchema.parse(found)
    if (record.runId !== runId || record.sessionId !== sessionId) {
      throw new Error('Axis Pivot retry action ownership does not match its decision')
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(`Axis Pivot retry action requires a decided record: ${record.status}`)
    }
    if (
      record.decision.action !== 'retry'
      || record.forced
      || !record.decision.taskId
    ) {
      throw new Error('Axis Pivot decision is not an executable task retry action')
    }
    return record as RetryDecision
  }

  private requireOwnership(state: AxisRunState, decision: RetryDecision): void {
    if (
      state.runId !== decision.runId
      || state.sessionId !== decision.sessionId
    ) {
      throw new Error('Axis Pivot retry action Run-state ownership mismatch')
    }
  }
}

function requireDecisionBoundState(
  state: AxisRunState,
  decision: RetryDecision,
  expectedRevision: number,
): void {
  if (
    state.revision !== expectedRevision
    || state.revision !== decision.sourceRevision + 1
  ) {
    throw new Error(
      `Axis Pivot retry action revision conflict: expected ${expectedRevision}, current ${state.revision}`,
    )
  }
  if (state.status !== 'failed') {
    throw new Error(`Axis Pivot retry action requires a failed Run, received ${state.status}`)
  }
  if (
    state.objective !== decision.objective
    || JSON.stringify(state.budget) !== JSON.stringify(decision.budget)
  ) {
    throw new Error('Axis Pivot retry action state does not match its decision snapshot')
  }
  const event = state.events.at(-1)
  if (
    event?.type !== 'pivot-decided'
    || event.pivotDecisionId !== decision.decisionId
    || event.taskId !== decision.decision.taskId
  ) {
    throw new Error('Axis Pivot retry action is not bound to the latest Run event')
  }
  const task = state.tasks.find(({ taskId }) => taskId === decision.decision.taskId)
  if (!task || task.status !== 'failed') {
    throw new Error('Axis Pivot retry action requires its decision-bound failed task')
  }
  if (!usageMatchesDecision(state, decision, 0)) {
    throw new Error('Axis Pivot retry action usage does not match its committed decision')
  }
}

function isAlreadyScheduled(
  state: AxisRunState,
  decision: RetryDecision,
  executionRevision: number,
): boolean {
  if (
    executionRevision !== decision.sourceRevision + 1
    || state.revision !== executionRevision + 1
    || state.status !== 'running'
  ) return false
  const event = state.events.at(-1)
  const task = state.tasks.find(({ taskId }) => taskId === decision.decision.taskId)
  return Boolean(
    event?.type === 'pivot-retry-scheduled'
    && event.pivotDecisionId === decision.decisionId
    && event.taskId === decision.decision.taskId
    && task?.status === 'pending'
    && usageMatchesDecision(state, decision, 1),
  )
}

function validateScheduledState(
  previous: AxisRunState,
  next: AxisRunState,
  decision: RetryDecision,
): void {
  if (
    next.runId !== previous.runId
    || next.sessionId !== previous.sessionId
    || next.revision !== previous.revision + 1
    || next.status !== 'running'
    || next.objective !== previous.objective
    || JSON.stringify(next.budget) !== JSON.stringify(previous.budget)
  ) {
    throw new Error('Axis Pivot retry Port returned an ownership or state result mismatch')
  }
  const event = next.events.at(-1)
  const task = next.tasks.find(({ taskId }) => taskId === decision.decision.taskId)
  if (
    event?.type !== 'pivot-retry-scheduled'
    || event.pivotDecisionId !== decision.decisionId
    || event.taskId !== decision.decision.taskId
    || task?.status !== 'pending'
    || task.error !== null
    || !usageMatchesDecision(next, decision, 1)
  ) {
    throw new Error('Axis Pivot retry Port returned invalid retry evidence')
  }
}

function usageMatchesDecision(
  state: AxisRunState,
  decision: RetryDecision,
  retryDelta: 0 | 1,
): boolean {
  return (
    state.usage.costUsd === decision.usageBefore.costUsd + decision.modelUsage.costUsd
    && state.usage.durationMs
      === decision.usageBefore.durationMs + decision.decisionDurationMs
    && state.usage.gateCyclesForFile === decision.usageBefore.gateCyclesForFile
    && state.usage.pivots === decision.usageBefore.pivots + 1
    && state.usage.retriesForTask
      === decision.usageBefore.retriesForTask + retryDelta
    && state.usage.tokens === decision.usageBefore.tokens + decision.modelUsage.tokens
  )
}

function retryResult(
  decision: RetryDecision,
  executionRevision: number,
  state: AxisRunState,
  outcome: AxisPivotRetryActionResult['outcome'],
): AxisPivotRetryActionResult {
  const event = AxisRunLifecycleEventSchema.parse(state.events.at(-1))
  return AxisPivotRetryActionResultSchema.parse({
    action: 'retry',
    authority: 'pivot-main',
    decisionId: decision.decisionId,
    event,
    executionRevision,
    outcome,
    runId: state.runId,
    schemaVersion: 1,
    sessionId: state.sessionId,
    stateRevision: state.revision,
    taskId: decision.decision.taskId,
  })
}
