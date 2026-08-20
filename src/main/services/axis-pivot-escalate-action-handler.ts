import {
  AxisPivotDecisionRecordSchema,
  AxisRunStateSchema,
  type AxisPivotDecisionRecord,
  type AxisRunState,
} from '../../shared/axis-engine-contracts'
import {
  AxisHumanEscalationReceiptSchema,
  type AxisHumanEscalationReceipt,
} from '../../shared/axis-human-escalation-contracts'
import {
  AxisPivotEscalateActionRequestSchema,
  AxisPivotEscalateActionResultSchema,
  type AxisPivotEscalateActionRequest,
  type AxisPivotEscalateActionResult,
} from '../../shared/axis-pivot-action-contracts'
import type {
  AxisHumanEscalationPort,
} from './axis-human-escalation-ports'
import type {
  AxisPivotDecisionReaderPort,
  AxisPivotRunStateReaderPort,
} from './axis-pivot-action-ports'

type EscalateDecision = AxisPivotDecisionRecord & {
  decision: NonNullable<AxisPivotDecisionRecord['decision']> & {
    action: 'escalate'
  }
  trigger: AxisPivotDecisionRecord['trigger'] & {
    category: 'design' | 'excessive' | 'security'
  }
}

export class AxisPivotEscalateActionHandler {
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly escalations: AxisHumanEscalationPort
  private readonly states: AxisPivotRunStateReaderPort

  constructor(options: {
    decisions: AxisPivotDecisionReaderPort
    escalations: AxisHumanEscalationPort
    states: AxisPivotRunStateReaderPort
  }) {
    this.decisions = options.decisions
    this.escalations = options.escalations
    this.states = options.states
  }

  execute(
    requestInput: AxisPivotEscalateActionRequest,
  ): AxisPivotEscalateActionResult {
    const request = AxisPivotEscalateActionRequestSchema.parse(requestInput)
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
        `Axis Pivot escalation source Run not found: ${request.runId}`,
      )
    }
    const state = AxisRunStateSchema.parse(foundState)
    requireDecisionBoundState(state, decision, request.expectedRevision)

    const existing = this.escalations.findByDecision(decision.decisionId)
    if (existing) {
      return escalationResult(
        decision,
        state.revision,
        requireMatchingReceipt(existing, decision, state),
        'already-open',
      )
    }

    let receipt: AxisHumanEscalationReceipt
    try {
      receipt = AxisHumanEscalationReceiptSchema.parse(
        this.escalations.open({
          category: decision.trigger.category,
          decisionId: decision.decisionId,
          evidenceIds: decision.trigger.evidenceIds,
          executionRevision: state.revision,
          reason: decision.decision.reason,
          runId: state.runId,
          sessionId: state.sessionId,
          summary: decision.trigger.summary,
          taskId: decision.decision.taskId,
        }),
      )
    } catch (error) {
      const concurrent = this.escalations.findByDecision(decision.decisionId)
      if (concurrent) {
        return escalationResult(
          decision,
          state.revision,
          requireMatchingReceipt(concurrent, decision, state),
          'already-open',
        )
      }
      throw error
    }

    return escalationResult(
      decision,
      state.revision,
      requireMatchingReceipt(receipt, decision, state),
      'opened',
    )
  }

  private requireDecision(
    decisionId: string,
    runId: string,
    sessionId: string,
  ): EscalateDecision {
    const found = this.decisions.find(decisionId)
    if (!found) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
    const parsed = AxisPivotDecisionRecordSchema.safeParse(found)
    if (!parsed.success) {
      throw new Error(
        `Axis Pivot escalation decision failed strict validation: ${parsed.error.message}`,
      )
    }
    const record = parsed.data
    if (record.runId !== runId || record.sessionId !== sessionId) {
      throw new Error(
        'Axis Pivot escalation action ownership does not match its decision',
      )
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(
        `Axis Pivot escalation action requires a decided record: ${record.status}`,
      )
    }
    if (
      record.decision.action !== 'escalate'
      || record.forced
      || !['design', 'excessive', 'security'].includes(record.trigger.category)
      || record.decision.taskId !== record.trigger.taskId
    ) {
      throw new Error(
        'Axis Pivot decision is not an unforced supported escalation action',
      )
    }
    return record as EscalateDecision
  }
}

function requireDecisionBoundState(
  state: AxisRunState,
  decision: EscalateDecision,
  expectedRevision: number,
): void {
  if (
    state.runId !== decision.runId
    || state.sessionId !== decision.sessionId
  ) {
    throw new Error('Axis Pivot escalation Run-state ownership mismatch')
  }
  if (
    state.revision !== expectedRevision
    || state.revision !== decision.sourceRevision + 1
  ) {
    throw new Error(
      `Axis Pivot escalation revision conflict: expected ${expectedRevision}, current ${state.revision}`,
    )
  }
  if (state.status !== decision.sourceStatus) {
    throw new Error(
      `Axis Pivot escalation source status mismatch: expected ${decision.sourceStatus}, current ${state.status}`,
    )
  }
  if (
    state.objective !== decision.objective
    || JSON.stringify(state.budget) !== JSON.stringify(decision.budget)
  ) {
    throw new Error(
      'Axis Pivot escalation state does not match its decision snapshot',
    )
  }
  const event = state.events.at(-1)
  if (
    event?.type !== 'pivot-decided'
    || event.pivotDecisionId !== decision.decisionId
    || event.taskId !== decision.decision.taskId
  ) {
    throw new Error(
      'Axis Pivot escalation action is not bound to the latest Run event',
    )
  }
  if (
    decision.decision.taskId
    && !state.tasks.some(({ taskId }) => taskId === decision.decision.taskId)
  ) {
    throw new Error(
      'Axis Pivot escalation decision-bound task does not exist',
    )
  }
  if (!usageMatchesDecision(state, decision)) {
    throw new Error(
      'Axis Pivot escalation usage does not match its committed decision',
    )
  }
}

function requireMatchingReceipt(
  input: AxisHumanEscalationReceipt,
  decision: EscalateDecision,
  state: AxisRunState,
): AxisHumanEscalationReceipt {
  const receipt = AxisHumanEscalationReceiptSchema.parse(input)
  if (
    receipt.category !== decision.trigger.category
    || receipt.decisionId !== decision.decisionId
    || JSON.stringify(receipt.evidenceIds)
      !== JSON.stringify(decision.trigger.evidenceIds)
    || receipt.executionRevision !== state.revision
    || receipt.reason !== decision.decision.reason
    || receipt.runId !== state.runId
    || receipt.sessionId !== state.sessionId
    || receipt.summary !== decision.trigger.summary
    || receipt.taskId !== decision.decision.taskId
  ) {
    throw new Error(
      'Axis Pivot escalation receipt ownership or evidence mismatch',
    )
  }
  return receipt
}

function usageMatchesDecision(
  state: AxisRunState,
  decision: EscalateDecision,
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

function escalationResult(
  decision: EscalateDecision,
  executionRevision: number,
  receipt: AxisHumanEscalationReceipt,
  outcome: AxisPivotEscalateActionResult['outcome'],
): AxisPivotEscalateActionResult {
  return AxisPivotEscalateActionResultSchema.parse({
    action: 'escalate',
    authority: 'pivot-main',
    decisionId: decision.decisionId,
    executionRevision,
    outcome,
    receipt,
    runId: receipt.runId,
    schemaVersion: 1,
    sessionId: receipt.sessionId,
    taskId: receipt.taskId,
  })
}
