import {
  AxisPivotDecisionRecordSchema,
  AxisRunStateSchema,
  type AxisPivotDecisionRecord,
  type AxisRunState,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotDiscardActionRequestSchema,
  AxisPivotDiscardActionResultSchema,
  type AxisPivotDiscardActionRequest,
  type AxisPivotDiscardActionResult,
} from '../../shared/axis-pivot-action-contracts'
import {
  AxisWorkerAttemptBindingSchema,
  type AxisWorkerAttemptBinding,
} from '../../shared/axis-worker-attempt-contracts'
import {
  AxisWorkerDiscardReceiptSchema,
  type AxisWorkerDiscardReceipt,
} from '../../shared/axis-worker-discard-contracts'
import type {
  AxisPivotDecisionReaderPort,
  AxisPivotRunStateReaderPort,
} from './axis-pivot-action-ports'
import type {
  AxisWorkerAttemptReaderPort,
} from './axis-worker-attempt-ports'
import type {
  AxisWorkerDiscardPort,
} from './axis-worker-discard-ports'

type DiscardDecision = AxisPivotDecisionRecord & {
  decision: NonNullable<AxisPivotDecisionRecord['decision']> & {
    action: 'discard'
    taskId: string
  }
}

export class AxisPivotDiscardActionHandler {
  private readonly attempts: AxisWorkerAttemptReaderPort
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly discards: AxisWorkerDiscardPort
  private readonly states: AxisPivotRunStateReaderPort

  constructor(options: {
    attempts: AxisWorkerAttemptReaderPort
    decisions: AxisPivotDecisionReaderPort
    discards: AxisWorkerDiscardPort
    states: AxisPivotRunStateReaderPort
  }) {
    this.attempts = options.attempts
    this.decisions = options.decisions
    this.discards = options.discards
    this.states = options.states
  }

  execute(
    requestInput: AxisPivotDiscardActionRequest,
  ): AxisPivotDiscardActionResult {
    const request = AxisPivotDiscardActionRequestSchema.parse(requestInput)
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
        `Axis Pivot discard source Run not found: ${request.runId}`,
      )
    }
    const state = AxisRunStateSchema.parse(foundState)
    const task = requireDecisionBoundState(
      state,
      decision,
      request.expectedRevision,
    )
    const foundAttempt = this.attempts.findLatest({
      runId: state.runId,
      sessionId: state.sessionId,
      taskId: task.taskId,
    })
    if (!foundAttempt) {
      throw new Error(
        `Axis Pivot discard Worker attempt not found: ${task.taskId}`,
      )
    }
    const attempt = AxisWorkerAttemptBindingSchema.parse(foundAttempt)
    requireFailedAttempt(attempt, state, task.attempts)

    const existing = this.discards.findByDecision(decision.decisionId)
    if (existing) {
      return discardResult(
        decision,
        state.revision,
        requireMatchingReceipt(existing, decision, state, attempt),
        'already-discarded',
      )
    }

    let receipt: AxisWorkerDiscardReceipt
    try {
      receipt = AxisWorkerDiscardReceiptSchema.parse(
        this.discards.discard({
          decisionId: decision.decisionId,
          executionRevision: state.revision,
          reason: decision.decision.reason,
          runId: state.runId,
          sessionId: state.sessionId,
          sourceAttempt: attempt.attempt,
          sourceAttemptId: attempt.attemptId,
          sourceWorkerId: attempt.workerId,
          taskId: task.taskId,
        }),
      )
    } catch (error) {
      const concurrent = this.discards.findByDecision(decision.decisionId)
      if (concurrent) {
        return discardResult(
          decision,
          state.revision,
          requireMatchingReceipt(concurrent, decision, state, attempt),
          'already-discarded',
        )
      }
      throw error
    }

    return discardResult(
      decision,
      state.revision,
      requireMatchingReceipt(receipt, decision, state, attempt),
      'discarded',
    )
  }

  private requireDecision(
    decisionId: string,
    runId: string,
    sessionId: string,
  ): DiscardDecision {
    const found = this.decisions.find(decisionId)
    if (!found) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
    const parsed = AxisPivotDecisionRecordSchema.safeParse(found)
    if (!parsed.success) {
      throw new Error(
        `Axis Pivot discard decision failed strict validation: ${parsed.error.message}`,
      )
    }
    const record = parsed.data
    if (record.runId !== runId || record.sessionId !== sessionId) {
      throw new Error(
        'Axis Pivot discard action ownership does not match its decision',
      )
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(
        `Axis Pivot discard action requires a decided record: ${record.status}`,
      )
    }
    if (
      record.decision.action !== 'discard'
      || record.forced
      || record.trigger.category !== 'excessive'
      || !record.decision.taskId
      || record.decision.taskId !== record.trigger.taskId
    ) {
      throw new Error(
        'Axis Pivot decision is not an unforced excessive discard action',
      )
    }
    return record as DiscardDecision
  }
}

function requireDecisionBoundState(
  state: AxisRunState,
  decision: DiscardDecision,
  expectedRevision: number,
): AxisRunState['tasks'][number] {
  if (
    state.runId !== decision.runId
    || state.sessionId !== decision.sessionId
  ) {
    throw new Error('Axis Pivot discard Run-state ownership mismatch')
  }
  if (
    state.revision !== expectedRevision
    || state.revision !== decision.sourceRevision + 1
  ) {
    throw new Error(
      `Axis Pivot discard revision conflict: expected ${expectedRevision}, current ${state.revision}`,
    )
  }
  if (state.status !== 'failed') {
    throw new Error(
      `Axis Pivot discard requires a failed Run, received ${state.status}`,
    )
  }
  if (
    state.objective !== decision.objective
    || JSON.stringify(state.budget) !== JSON.stringify(decision.budget)
  ) {
    throw new Error(
      'Axis Pivot discard state does not match its decision snapshot',
    )
  }
  const event = state.events.at(-1)
  if (
    event?.type !== 'pivot-decided'
    || event.pivotDecisionId !== decision.decisionId
    || event.taskId !== decision.decision.taskId
  ) {
    throw new Error(
      'Axis Pivot discard action is not bound to the latest Run event',
    )
  }
  const task = state.tasks.find(
    ({ taskId }) => taskId === decision.decision.taskId,
  )
  if (!task || task.status !== 'failed') {
    throw new Error(
      'Axis Pivot discard requires its decision-bound failed task',
    )
  }
  if (!usageMatchesDecision(state, decision)) {
    throw new Error(
      'Axis Pivot discard usage does not match its committed decision',
    )
  }
  return task
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
    throw new Error('Axis Pivot discard Worker attempt ownership mismatch')
  }
  if (attempt.status !== 'failed') {
    throw new Error(
      `Axis Pivot discard requires a failed Worker attempt, received ${attempt.status}`,
    )
  }
  if (attempt.attempt !== taskAttempts) {
    throw new Error(
      'Axis Pivot discard Worker attempt does not match the failed task attempt',
    )
  }
}

function requireMatchingReceipt(
  input: AxisWorkerDiscardReceipt,
  decision: DiscardDecision,
  state: AxisRunState,
  attempt: AxisWorkerAttemptBinding,
): AxisWorkerDiscardReceipt {
  const receipt = AxisWorkerDiscardReceiptSchema.parse(input)
  if (
    receipt.decisionId !== decision.decisionId
    || receipt.executionRevision !== state.revision
    || receipt.reason !== decision.decision.reason
    || receipt.runId !== state.runId
    || receipt.sessionId !== state.sessionId
    || receipt.taskId !== decision.decision.taskId
    || receipt.sourceAttempt !== attempt.attempt
    || receipt.sourceAttemptId !== attempt.attemptId
    || receipt.sourceWorkerId !== attempt.workerId
  ) {
    throw new Error(
      'Axis Pivot discard receipt ownership or evidence mismatch',
    )
  }
  return receipt
}

function usageMatchesDecision(
  state: AxisRunState,
  decision: DiscardDecision,
): boolean {
  return (
    state.usage.costUsd
      === decision.usageBefore.costUsd + decision.modelUsage.costUsd
    && state.usage.durationMs
      === decision.usageBefore.durationMs + decision.decisionDurationMs
    && state.usage.gateCyclesForFile
      === decision.usageBefore.gateCyclesForFile
    && state.usage.pivots === decision.usageBefore.pivots + 1
    && state.usage.retriesForTask === decision.usageBefore.retriesForTask
    && state.usage.tokens
      === decision.usageBefore.tokens + decision.modelUsage.tokens
  )
}

function discardResult(
  decision: DiscardDecision,
  executionRevision: number,
  receipt: AxisWorkerDiscardReceipt,
  outcome: AxisPivotDiscardActionResult['outcome'],
): AxisPivotDiscardActionResult {
  return AxisPivotDiscardActionResultSchema.parse({
    action: 'discard',
    authority: 'pivot-main',
    decisionId: decision.decisionId,
    executionRevision,
    outcome,
    receipt,
    runId: receipt.runId,
    schemaVersion: 1,
    sessionId: receipt.sessionId,
    taskId: receipt.taskId,
    workerId: receipt.sourceWorkerId,
  })
}
