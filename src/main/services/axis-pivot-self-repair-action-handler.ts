import {
  AxisPivotDecisionRecordSchema,
  AxisRunStateSchema,
  type AxisPivotDecisionRecord,
  type AxisRunState,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotSelfRepairActionRequestSchema,
  AxisPivotSelfRepairActionResultSchema,
  type AxisPivotSelfRepairActionRequest,
  type AxisPivotSelfRepairActionResult,
} from '../../shared/axis-pivot-action-contracts'
import {
  AxisSelfRepairAssignmentSchema,
  AxisWorkerAttemptBindingSchema,
  type AxisSelfRepairAssignment,
  type AxisWorkerAttemptBinding,
} from '../../shared/axis-worker-attempt-contracts'
import type {
  AxisPivotAssignmentStatePort,
  AxisPivotDecisionReaderPort,
} from './axis-pivot-action-ports'
import type {
  AxisSelfRepairAssignmentPort,
  AxisWorkerAttemptReaderPort,
} from './axis-worker-attempt-ports'

type SelfRepairDecision = AxisPivotDecisionRecord & {
  decision: NonNullable<AxisPivotDecisionRecord['decision']> & {
    action: 'self-repair'
    taskId: string
  }
}
type ScheduledSelfRepairResult = Extract<
  AxisPivotSelfRepairActionResult,
  { schemaVersion: 2 }
>

export class AxisPivotSelfRepairActionHandler {
  private readonly assignments: AxisSelfRepairAssignmentPort
  private readonly attempts: AxisWorkerAttemptReaderPort
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly states: AxisPivotAssignmentStatePort

  constructor(options: {
    assignments: AxisSelfRepairAssignmentPort
    attempts: AxisWorkerAttemptReaderPort
    decisions: AxisPivotDecisionReaderPort
    states: AxisPivotAssignmentStatePort
  }) {
    this.assignments = options.assignments
    this.attempts = options.attempts
    this.decisions = options.decisions
    this.states = options.states
  }

  execute(
    requestInput: AxisPivotSelfRepairActionRequest,
  ): ScheduledSelfRepairResult {
    const request = AxisPivotSelfRepairActionRequestSchema.parse(requestInput)
    const decision = this.requireDecision(
      request.decisionId,
      request.runId,
      request.sessionId,
    )
    const foundState = this.states.find({
      runId: request.runId,
      sessionId: request.sessionId,
    })
    if (!foundState) {
      throw new Error(
        `Axis Pivot self-repair source Run not found: ${request.runId}`,
      )
    }
    const state = AxisRunStateSchema.parse(foundState)
    const alreadyScheduled = isAlreadyScheduled(
      state,
      decision,
      request.expectedRevision,
    )
    const task = alreadyScheduled
      ? requireScheduledTask(state, decision)
      : requireDecisionBoundState(state, decision, request.expectedRevision)
    if (!alreadyScheduled) requireRemainingBudget(state)
    const foundAttempt = this.attempts.findLatest({
      runId: state.runId,
      sessionId: state.sessionId,
      taskId: task.taskId,
    })
    if (!foundAttempt) {
      throw new Error(
        `Axis Pivot self-repair Worker attempt not found: ${task.taskId}`,
      )
    }
    const attempt = AxisWorkerAttemptBindingSchema.parse(foundAttempt)
    requireFailedAttempt(attempt, state, task.attempts)

    const existing = this.assignments.findByDecision(decision.decisionId)
    let assignment: AxisSelfRepairAssignment
    let outcome: AxisPivotSelfRepairActionResult['outcome']
    if (existing) {
      assignment = requireMatchingAssignment(existing, decision, state, attempt)
      outcome = 'already-assigned'
    } else {
      if (alreadyScheduled) {
        throw new Error('Axis Pivot self-repair schedule is missing its assignment evidence')
      }
      try {
        assignment = AxisSelfRepairAssignmentSchema.parse(this.assignments.assign({
          decisionId: decision.decisionId,
          executionRevision: state.revision,
          issue: decision.decision.reason,
          runId: state.runId,
          sessionId: state.sessionId,
          sourceAttempt: attempt.attempt,
          sourceAttemptId: attempt.attemptId,
          taskId: task.taskId,
          workerId: attempt.workerId,
        }))
        assignment = requireMatchingAssignment(assignment, decision, state, attempt)
        outcome = 'assigned'
      } catch (error) {
        const concurrent = this.assignments.findByDecision(decision.decisionId)
        if (!concurrent) throw error
        assignment = requireMatchingAssignment(concurrent, decision, state, attempt)
        outcome = 'already-assigned'
      }
    }
    if (alreadyScheduled) {
      return selfRepairResult(decision, assignment, outcome, state, 'already-scheduled')
    }

    let next: AxisRunState
    try {
      next = AxisRunStateSchema.parse(this.states.scheduleAssignment({
        action: 'self-repair',
        decisionId: decision.decisionId,
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        taskId: task.taskId,
      }))
    } catch (error) {
      const concurrent = this.states.find({
        runId: request.runId,
        sessionId: request.sessionId,
      })
      if (concurrent) {
        const current = AxisRunStateSchema.parse(concurrent)
        if (isAlreadyScheduled(current, decision, request.expectedRevision)) {
          return selfRepairResult(
            decision,
            assignment,
            outcome,
            current,
            'already-scheduled',
          )
        }
      }
      throw error
    }
    validateScheduledState(state, next, decision)
    return selfRepairResult(decision, assignment, outcome, next, 'scheduled')
  }

  private requireDecision(
    decisionId: string,
    runId: string,
    sessionId: string,
  ): SelfRepairDecision {
    const found = this.decisions.find(decisionId)
    if (!found) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
    const record = AxisPivotDecisionRecordSchema.parse(found)
    if (record.runId !== runId || record.sessionId !== sessionId) {
      throw new Error(
        'Axis Pivot self-repair action ownership does not match its decision',
      )
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(
        `Axis Pivot self-repair action requires a decided record: ${record.status}`,
      )
    }
    if (
      record.decision.action !== 'self-repair'
      || record.forced
      || record.trigger.category !== 'minor'
      || !record.decision.taskId
      || record.decision.taskId !== record.trigger.taskId
    ) {
      throw new Error(
        'Axis Pivot decision is not an executable minor self-repair action',
      )
    }
    return record as SelfRepairDecision
  }
}

function requireDecisionBoundState(
  state: AxisRunState,
  decision: SelfRepairDecision,
  expectedRevision: number,
): AxisRunState['tasks'][number] {
  if (
    state.runId !== decision.runId
    || state.sessionId !== decision.sessionId
  ) {
    throw new Error('Axis Pivot self-repair Run-state ownership mismatch')
  }
  if (
    state.revision !== expectedRevision
    || state.revision !== decision.sourceRevision + 1
  ) {
    throw new Error(
      `Axis Pivot self-repair revision conflict: expected ${expectedRevision}, current ${state.revision}`,
    )
  }
  if (state.status !== 'failed') {
    throw new Error(
      `Axis Pivot self-repair requires a failed Run, received ${state.status}`,
    )
  }
  if (
    state.objective !== decision.objective
    || JSON.stringify(state.budget) !== JSON.stringify(decision.budget)
  ) {
    throw new Error(
      'Axis Pivot self-repair state does not match its decision snapshot',
    )
  }
  const event = state.events.at(-1)
  if (
    event?.type !== 'pivot-decided'
    || event.pivotDecisionId !== decision.decisionId
    || event.taskId !== decision.decision.taskId
  ) {
    throw new Error(
      'Axis Pivot self-repair action is not bound to the latest Run event',
    )
  }
  const task = state.tasks.find(
    ({ taskId }) => taskId === decision.decision.taskId,
  )
  if (!task || task.status !== 'failed') {
    throw new Error(
      'Axis Pivot self-repair requires its decision-bound failed task',
    )
  }
  if (!usageMatchesDecision(state, decision)) {
    throw new Error(
      'Axis Pivot self-repair usage does not match its committed decision',
    )
  }
  return task
}

function requireRemainingBudget(state: AxisRunState): void {
  if (
    state.usage.retriesForTask >= state.budget.maxRetriesPerTask
    || state.usage.tokens >= state.budget.maxTokens
    || state.usage.costUsd >= state.budget.maxCostUsd
    || state.usage.durationMs >= state.budget.maxDurationMs
    || state.usage.gateCyclesForFile >= state.budget.maxGateCyclesPerFile
  ) {
    throw new Error(
      'Axis Pivot self-repair assignment is blocked by an exhausted budget limit',
    )
  }
}

function requireFailedAttempt(
  attempt: AxisWorkerAttemptBinding,
  state: AxisRunState,
  taskAttempts: number,
): void {
  if (
    attempt.runId !== state.runId
    || attempt.sessionId !== state.sessionId
  ) {
    throw new Error('Axis Pivot self-repair Worker attempt ownership mismatch')
  }
  if (attempt.status !== 'failed') {
    throw new Error(
      `Axis Pivot self-repair requires a failed Worker attempt, received ${attempt.status}`,
    )
  }
  if (attempt.attempt !== taskAttempts) {
    throw new Error(
      'Axis Pivot self-repair Worker attempt does not match the failed task attempt',
    )
  }
}

function requireMatchingAssignment(
  input: AxisSelfRepairAssignment,
  decision: SelfRepairDecision,
  state: AxisRunState,
  attempt: AxisWorkerAttemptBinding,
): AxisSelfRepairAssignment {
  const assignment = AxisSelfRepairAssignmentSchema.parse(input)
  if (
    assignment.decisionId !== decision.decisionId
    || assignment.executionRevision !== decision.sourceRevision + 1
    || assignment.issue !== decision.decision.reason
    || assignment.runId !== state.runId
    || assignment.sessionId !== state.sessionId
    || assignment.taskId !== decision.decision.taskId
    || assignment.sourceAttempt !== attempt.attempt
    || assignment.sourceAttemptId !== attempt.attemptId
    || assignment.workerId !== attempt.workerId
  ) {
    throw new Error(
      'Axis Pivot self-repair assignment ownership or evidence mismatch',
    )
  }
  return assignment
}

function usageMatchesDecision(
  state: AxisRunState,
  decision: SelfRepairDecision,
  retryDelta = 0,
): boolean {
  return (
    state.usage.costUsd
      === decision.usageBefore.costUsd + decision.modelUsage.costUsd
    && state.usage.durationMs
      === decision.usageBefore.durationMs + decision.decisionDurationMs
    && state.usage.gateCyclesForFile
      === decision.usageBefore.gateCyclesForFile
    && state.usage.pivots === decision.usageBefore.pivots + 1
    && state.usage.retriesForTask
      === decision.usageBefore.retriesForTask + retryDelta
    && state.usage.tokens
      === decision.usageBefore.tokens + decision.modelUsage.tokens
  )
}

function selfRepairResult(
  decision: SelfRepairDecision,
  assignment: AxisSelfRepairAssignment,
  outcome: ScheduledSelfRepairResult['outcome'],
  state: AxisRunState,
  scheduleOutcome: 'scheduled' | 'already-scheduled',
): ScheduledSelfRepairResult {
  const result = AxisPivotSelfRepairActionResultSchema.parse({
    action: 'self-repair',
    assignment,
    authority: 'pivot-main',
    decisionId: decision.decisionId,
    event: state.events.at(-1),
    executionRevision: assignment.executionRevision,
    outcome,
    runId: assignment.runId,
    scheduleOutcome,
    schemaVersion: 2,
    sessionId: assignment.sessionId,
    stateRevision: state.revision,
    taskId: assignment.taskId,
    workerId: assignment.workerId,
  })
  if (result.schemaVersion !== 2) {
    throw new Error('Axis Pivot self-repair produced legacy assignment-only evidence')
  }
  return result
}

function isAlreadyScheduled(
  state: AxisRunState,
  decision: SelfRepairDecision,
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
    event?.type === 'pivot-self-repair-scheduled'
    && event.pivotDecisionId === decision.decisionId
    && event.taskId === decision.decision.taskId
    && task?.status === 'pending'
    && task.error === null
    && usageMatchesDecision(state, decision, 1),
  )
}

function requireScheduledTask(
  state: AxisRunState,
  decision: SelfRepairDecision,
): AxisRunState['tasks'][number] {
  const task = state.tasks.find(({ taskId }) => taskId === decision.decision.taskId)
  if (!task || task.status !== 'pending') {
    throw new Error('Axis Pivot self-repair scheduled task evidence is invalid')
  }
  return task
}

function validateScheduledState(
  previous: AxisRunState,
  next: AxisRunState,
  decision: SelfRepairDecision,
): void {
  if (
    next.runId !== previous.runId
    || next.sessionId !== previous.sessionId
    || next.revision !== previous.revision + 1
    || !isAlreadyScheduled(next, decision, previous.revision)
  ) {
    throw new Error('Axis Pivot self-repair state Port returned invalid schedule evidence')
  }
}
