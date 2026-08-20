import {
  AxisPlanLineageSchema,
  AxisPlanningContextSchema,
  AxisPivotDecisionRecordSchema,
  AxisRunStateSchema,
  AxisShadowRunResultSchema,
  BudgetEnvelopeSchema,
  type AxisPivotDecisionRecord,
  type AxisRunState,
  type BudgetEnvelope,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotReplanActionRequestSchema,
  AxisPivotReplanActionResultSchema,
  type AxisPivotReplanActionRequest,
  type AxisPivotReplanActionResult,
} from '../../shared/axis-pivot-action-contracts'
import type {
  AxisPivotDecisionReaderPort,
  AxisPivotPlanningContextPort,
  AxisPivotReplanPort,
  AxisPivotReplanPortResult,
  AxisPivotRunStateReaderPort,
} from './axis-pivot-action-ports'

export class AxisPivotReplanActionHandler {
  private readonly contexts: AxisPivotPlanningContextPort
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly replans: AxisPivotReplanPort
  private readonly states: AxisPivotRunStateReaderPort

  constructor(options: {
    contexts: AxisPivotPlanningContextPort
    decisions: AxisPivotDecisionReaderPort
    replans: AxisPivotReplanPort
    states: AxisPivotRunStateReaderPort
  }) {
    this.contexts = options.contexts
    this.decisions = options.decisions
    this.replans = options.replans
    this.states = options.states
  }

  async execute(
    requestInput: AxisPivotReplanActionRequest,
  ): Promise<AxisPivotReplanActionResult> {
    const request = AxisPivotReplanActionRequestSchema.parse(requestInput)
    const decision = this.requireDecision(request.decisionId, request.runId, request.sessionId)
    const state = this.requireDecisionState(decision, request.expectedRevision)
    const budget = remainingBudget(state)
    const completed = this.replans.findCompleted({
      parentRunId: state.runId,
      sessionId: state.sessionId,
      sourceRevision: state.revision,
    })
    if (completed) {
      return actionResult(decision, state, budget, completed, 'already-completed')
    }

    const context = AxisPlanningContextSchema.parse(await this.contexts.resolve({
      runId: state.runId,
      sessionId: state.sessionId,
    }))
    const result = await this.replans.replan({
      budget,
      context,
      expectedRevision: state.revision,
      parentRunId: state.runId,
      sessionId: state.sessionId,
    })
    return actionResult(decision, state, budget, result, 'created')
  }

  private requireDecision(
    decisionId: string,
    runId: string,
    sessionId: string,
  ): AxisPivotDecisionRecord & { decision: NonNullable<AxisPivotDecisionRecord['decision']> } {
    const found = this.decisions.find(decisionId)
    if (!found) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
    const record = AxisPivotDecisionRecordSchema.parse(found)
    if (record.runId !== runId || record.sessionId !== sessionId) {
      throw new Error('Axis Pivot replan action ownership does not match its decision')
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(`Axis Pivot replan action requires a decided record: ${record.status}`)
    }
    if (record.decision.action !== 'replan' || record.forced) {
      throw new Error('Axis Pivot decision is not an executable replan action')
    }
    return record as AxisPivotDecisionRecord & {
      decision: NonNullable<AxisPivotDecisionRecord['decision']>
    }
  }

  private requireDecisionState(
    decision: AxisPivotDecisionRecord & {
      decision: NonNullable<AxisPivotDecisionRecord['decision']>
    },
    expectedRevision: number,
  ): AxisRunState & { status: 'failed' | 'paused' } {
    const state = this.states.find({
      runId: decision.runId,
      sessionId: decision.sessionId,
    })
    if (!state) throw new Error(`Axis Pivot source Run not found: ${decision.runId}`)
    const validated = AxisRunStateSchema.parse(state)
    if (
      validated.runId !== decision.runId
      || validated.sessionId !== decision.sessionId
    ) {
      throw new Error('Axis Pivot replan action Run-state ownership mismatch')
    }
    if (
      validated.revision !== expectedRevision
      || validated.revision !== decision.sourceRevision + 1
    ) {
      throw new Error(
        `Axis Pivot replan action revision conflict: expected ${expectedRevision}, current ${validated.revision}`,
      )
    }
    if (validated.status !== 'failed' && validated.status !== 'paused') {
      throw new Error(
        `Axis Pivot replan action requires a failed or paused Run, received ${validated.status}`,
      )
    }
    if (
      validated.objective !== decision.objective
      || JSON.stringify(validated.budget) !== JSON.stringify(decision.budget)
    ) {
      throw new Error('Axis Pivot replan action state does not match its decision snapshot')
    }
    const event = validated.events.at(-1)
    if (
      event?.type !== 'pivot-decided'
      || event.pivotDecisionId !== decision.decisionId
      || event.taskId !== decision.decision.taskId
    ) {
      throw new Error('Axis Pivot replan action is not bound to the latest Run event')
    }
    if (!usageMatchesDecision(validated, decision)) {
      throw new Error('Axis Pivot replan action usage does not match its committed decision')
    }
    return validated as AxisRunState & { status: 'failed' | 'paused' }
  }
}

function remainingBudget(state: AxisRunState): BudgetEnvelope {
  const remaining = {
    maxCostUsd: state.budget.maxCostUsd - state.usage.costUsd,
    maxDurationMs: state.budget.maxDurationMs - state.usage.durationMs,
    maxGateCyclesPerFile:
      state.budget.maxGateCyclesPerFile - state.usage.gateCyclesForFile,
    maxPivots: state.budget.maxPivots - state.usage.pivots,
    maxRetriesPerTask:
      state.budget.maxRetriesPerTask - state.usage.retriesForTask,
    maxTokens: state.budget.maxTokens - state.usage.tokens,
    maxWorkers: state.budget.maxWorkers,
  }
  const parsed = BudgetEnvelopeSchema.safeParse(remaining)
  if (!parsed.success) {
    throw new Error('Axis Pivot replan action cannot reset an exhausted parent budget')
  }
  return parsed.data
}

function usageMatchesDecision(
  state: AxisRunState,
  decision: AxisPivotDecisionRecord & {
    decision: NonNullable<AxisPivotDecisionRecord['decision']>
  },
): boolean {
  const consumesPivot = decision.decision.action === 'stop' ? 0 : 1
  return (
    state.usage.costUsd === decision.usageBefore.costUsd + decision.modelUsage.costUsd
    && state.usage.durationMs
      === decision.usageBefore.durationMs + decision.decisionDurationMs
    && state.usage.gateCyclesForFile === decision.usageBefore.gateCyclesForFile
    && state.usage.pivots === decision.usageBefore.pivots + consumesPivot
    && state.usage.retriesForTask === decision.usageBefore.retriesForTask
    && state.usage.tokens === decision.usageBefore.tokens + decision.modelUsage.tokens
  )
}

function actionResult(
  decision: AxisPivotDecisionRecord,
  state: AxisRunState,
  budget: BudgetEnvelope,
  resultInput: AxisPivotReplanPortResult,
  outcome: AxisPivotReplanActionResult['outcome'],
): AxisPivotReplanActionResult {
  const lineage = AxisPlanLineageSchema.parse(resultInput.lineage)
  const plan = AxisShadowRunResultSchema.parse(resultInput.plan)
  if (
    lineage.status !== 'completed'
    || lineage.parentRunId !== state.runId
    || lineage.sessionId !== state.sessionId
    || lineage.sourceRevision !== state.revision
    || lineage.childRunId !== plan.trace.runId
    || plan.trace.sessionId !== state.sessionId
    || plan.objective !== state.objective
    || JSON.stringify(lineage.budget) !== JSON.stringify(budget)
  ) {
    throw new Error('Axis Pivot replan result does not match its decision-bound request')
  }
  return AxisPivotReplanActionResultSchema.parse({
    action: 'replan',
    authority: 'pivot-main',
    decisionId: decision.decisionId,
    executionRevision: state.revision,
    lineage,
    outcome,
    parentRunId: state.runId,
    schemaVersion: 1,
    sessionId: state.sessionId,
  })
}
