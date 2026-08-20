import {
  AxisPivotDecisionRecordSchema,
  AxisRunLifecycleEventSchema,
  AxisRunStateSchema,
  type AxisPivotDecisionRecord,
  type AxisRunLifecycleEvent,
  type AxisRunState,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotStopActionRequestSchema,
  AxisPivotStopActionResultSchema,
  type AxisPivotStopActionRequest,
  type AxisPivotStopActionResult,
} from '../../shared/axis-pivot-action-contracts'
import type {
  AxisPivotDecisionReaderPort,
  AxisPivotStopStatePort,
} from './axis-pivot-action-ports'

type StopDecision = AxisPivotDecisionRecord & {
  decision: NonNullable<AxisPivotDecisionRecord['decision']> & {
    action: 'stop'
  }
}

export class AxisPivotStopActionHandler {
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly states: AxisPivotStopStatePort

  constructor(options: {
    decisions: AxisPivotDecisionReaderPort
    states: AxisPivotStopStatePort
  }) {
    this.decisions = options.decisions
    this.states = options.states
  }

  execute(
    requestInput: AxisPivotStopActionRequest,
  ): AxisPivotStopActionResult {
    const request = AxisPivotStopActionRequestSchema.parse(requestInput)
    const decision = this.requireDecision(
      request.decisionId,
      request.runId,
      request.sessionId,
    )
    const found = this.states.find({
      runId: request.runId,
      sessionId: request.sessionId,
    })
    if (!found) {
      throw new Error(
        `Axis Pivot stop source Run not found: ${request.runId}`,
      )
    }
    const state = AxisRunStateSchema.parse(found)
    requireOwnership(state, decision)
    if (isAlreadyStopped(state, decision, request.expectedRevision)) {
      return stopResult(
        decision,
        request.expectedRevision,
        state,
        'already-stopped',
      )
    }
    requireDecisionBoundState(state, decision, request.expectedRevision)

    let next: AxisRunState
    try {
      next = AxisRunStateSchema.parse(this.states.stopPivot({
        decisionId: decision.decisionId,
        expectedRevision: state.revision,
        reason: decision.decision.reason,
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
        requireOwnership(current, decision)
        if (isAlreadyStopped(
          current,
          decision,
          request.expectedRevision,
        )) {
          return stopResult(
            decision,
            request.expectedRevision,
            current,
            'already-stopped',
          )
        }
      }
      throw error
    }

    validateStoppedState(state, next, decision)
    return stopResult(decision, state.revision, next, 'stopped')
  }

  private requireDecision(
    decisionId: string,
    runId: string,
    sessionId: string,
  ): StopDecision {
    const found = this.decisions.find(decisionId)
    if (!found) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
    const parsed = AxisPivotDecisionRecordSchema.safeParse(found)
    if (!parsed.success) {
      throw new Error(
        `Axis Pivot stop decision failed strict validation: ${parsed.error.message}`,
      )
    }
    const record = parsed.data
    if (record.runId !== runId || record.sessionId !== sessionId) {
      throw new Error(
        'Axis Pivot stop action ownership does not match its decision',
      )
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(
        `Axis Pivot stop action requires a decided record: ${record.status}`,
      )
    }
    if (record.decision.action !== 'stop') {
      throw new Error('Axis Pivot decision is not a stop action')
    }
    return record as StopDecision
  }
}

function requireOwnership(
  state: AxisRunState,
  decision: StopDecision,
): void {
  if (
    state.runId !== decision.runId
    || state.sessionId !== decision.sessionId
  ) {
    throw new Error('Axis Pivot stop Run-state ownership mismatch')
  }
}

function requireDecisionBoundState(
  state: AxisRunState,
  decision: StopDecision,
  expectedRevision: number,
): void {
  if (
    state.revision !== expectedRevision
    || state.revision !== decision.sourceRevision + 1
  ) {
    throw new Error(
      `Axis Pivot stop revision conflict: expected ${expectedRevision}, current ${state.revision}`,
    )
  }
  if (state.status !== decision.sourceStatus) {
    throw new Error(
      `Axis Pivot stop source status mismatch: expected ${decision.sourceStatus}, current ${state.status}`,
    )
  }
  if (
    state.objective !== decision.objective
    || JSON.stringify(state.budget) !== JSON.stringify(decision.budget)
  ) {
    throw new Error(
      'Axis Pivot stop state does not match its decision snapshot',
    )
  }
  const event = state.events.at(-1)
  if (
    event?.type !== 'pivot-decided'
    || event.pivotDecisionId !== decision.decisionId
    || event.taskId !== decision.decision.taskId
  ) {
    throw new Error(
      'Axis Pivot stop action is not bound to the latest Run event',
    )
  }
  if (
    decision.decision.taskId
    && !state.tasks.some(({ taskId }) => taskId === decision.decision.taskId)
  ) {
    throw new Error('Axis Pivot stop decision-bound task does not exist')
  }
  if (!usageMatchesDecision(state, decision)) {
    throw new Error(
      'Axis Pivot stop usage does not match its committed decision',
    )
  }
}

function isAlreadyStopped(
  state: AxisRunState,
  decision: StopDecision,
  executionRevision: number,
): boolean {
  if (
    executionRevision !== decision.sourceRevision + 1
    || state.revision !== executionRevision + 1
    || state.status !== 'stopped'
    || state.objective !== decision.objective
    || JSON.stringify(state.budget) !== JSON.stringify(decision.budget)
    || !usageMatchesDecision(state, decision)
    || state.tasks.some(({ status }) => (
      status === 'pending' || status === 'running'
    ))
  ) {
    return false
  }
  return stopEventMatches(state.events.at(-1), decision, state.revision)
}

function validateStoppedState(
  previous: AxisRunState,
  next: AxisRunState,
  decision: StopDecision,
): void {
  const event = next.events.at(-1)
  if (
    next.runId !== previous.runId
    || next.sessionId !== previous.sessionId
    || next.revision !== previous.revision + 1
    || next.status !== 'stopped'
    || next.objective !== previous.objective
    || JSON.stringify(next.budget) !== JSON.stringify(previous.budget)
    || JSON.stringify(next.usage) !== JSON.stringify(previous.usage)
    || !stopEventMatches(event, decision, next.revision)
    || !stoppedTasksMatch(previous, next, event?.timestamp)
  ) {
    throw new Error(
      'Axis Pivot stop Port returned invalid terminal state evidence',
    )
  }
}

function stopEventMatches(
  event: AxisRunLifecycleEvent | undefined,
  decision: StopDecision,
  revision: number,
): boolean {
  return Boolean(
    event?.type === 'pivot-stopped'
    && event.pivotDecisionId === decision.decisionId
    && event.revision === revision
    && event.taskId === decision.decision.taskId
    && event.detail === decision.decision.reason,
  )
}

function stoppedTasksMatch(
  previous: AxisRunState,
  next: AxisRunState,
  timestamp: string | undefined,
): boolean {
  if (!timestamp || previous.tasks.length !== next.tasks.length) return false
  return previous.tasks.every((task, index) => {
    const expected = task.status === 'pending' || task.status === 'running'
      ? { ...task, status: 'cancelled', updatedAt: timestamp }
      : task
    return JSON.stringify(next.tasks[index]) === JSON.stringify(expected)
  })
}

function usageMatchesDecision(
  state: AxisRunState,
  decision: StopDecision,
): boolean {
  return (
    state.usage.costUsd
      === decision.usageBefore.costUsd + decision.modelUsage.costUsd
    && state.usage.durationMs
      === decision.usageBefore.durationMs + decision.decisionDurationMs
    && state.usage.gateCyclesForFile
      === decision.usageBefore.gateCyclesForFile
    && state.usage.pivots === decision.usageBefore.pivots
    && state.usage.retriesForTask === decision.usageBefore.retriesForTask
    && state.usage.tokens
      === decision.usageBefore.tokens + decision.modelUsage.tokens
  )
}

function stopResult(
  decision: StopDecision,
  executionRevision: number,
  state: AxisRunState,
  outcome: AxisPivotStopActionResult['outcome'],
): AxisPivotStopActionResult {
  const event = AxisRunLifecycleEventSchema.parse(state.events.at(-1))
  return AxisPivotStopActionResultSchema.parse({
    action: 'stop',
    authority: 'pivot-main',
    decisionId: decision.decisionId,
    event,
    executionRevision,
    forced: decision.forced,
    outcome,
    reason: decision.decision.reason,
    runId: state.runId,
    schemaVersion: 1,
    sessionId: state.sessionId,
    stateRevision: state.revision,
    stopReason: decision.stopReason,
    taskId: decision.decision.taskId,
  })
}
