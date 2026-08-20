import { randomUUID } from 'node:crypto'
import {
  AxisModelUsageSchema,
  AxisPivotRequestSchema,
  PivotDecisionSchema,
  type AxisModelUsage,
  type AxisPivotDecisionRecord,
  type AxisPivotRequest,
  type AxisRunState,
  type PivotDecision,
} from '../../shared/axis-engine-contracts'
import type {
  AxisPivotDecisionRegistry,
  AxisPivotFailureInput,
} from './axis-pivot-decision-registry'
import type { AxisPivotModel } from './axis-pivot-model'
import {
  allowedAxisPivotActions,
  preflightAxisPivotStop,
  projectedAxisPivotStop,
  validateAxisPivotProposal,
} from './axis-pivot-policy'

interface AxisPivotStateStore {
  get(runId: string): AxisRunState | null
  recordPivot(request: {
    decision: PivotDecision
    decisionDurationMs: number
    decisionId: string
    expectedRevision: number
    modelUsage: AxisModelUsage
    runId: string
    sessionId: string
  }): AxisRunState
}

export class AxisPivotCoordinator {
  private readonly clock: () => Date
  private readonly decisions: AxisPivotDecisionRegistry
  private readonly idFactory: () => string
  private readonly model: AxisPivotModel
  private readonly states: AxisPivotStateStore

  constructor(options: {
    clock?: () => Date
    decisions: AxisPivotDecisionRegistry
    idFactory?: () => string
    model: AxisPivotModel
    states: AxisPivotStateStore
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.decisions = options.decisions
    this.idFactory = options.idFactory ?? (() => `pivot-${randomUUID()}`)
    this.model = options.model
    this.states = options.states
  }

  async decide(requestInput: AxisPivotRequest): Promise<AxisPivotDecisionRecord> {
    const request = AxisPivotRequestSchema.parse(requestInput)
    const state = this.requireSourceState(request)
    requireTriggerTask(state, request)
    const allowedActions = allowedAxisPivotActions(request.trigger)
    const pending = this.decisions.begin({
      allowedActions,
      decisionId: this.idFactory(),
      state,
      trigger: request.trigger,
    })
    const preflightStop = preflightAxisPivotStop(state.budget, state.usage)
    if (preflightStop) {
      const prepared = this.decisions.markCommitting(pending.decisionId, {
        decision: forcedStopDecision(request, preflightStop),
        decisionDurationMs: 0,
        forced: true,
        modelUsage: emptyModelUsage(),
        proposal: null,
        stopReason: preflightStop,
      })
      return this.commitPrepared(prepared)
    }

    const startedAt = this.clock()
    let failureEvidence: AxisPivotFailureInput = { error: 'Axis Pivot Provider decision failed' }
    try {
      const generation = await this.model.decidePivot({
        allowedActions,
        objective: state.objective,
        remainingBudget: pending.remainingBudget,
        runId: state.runId,
        sessionId: state.sessionId,
        sourceRevision: state.revision,
        sourceStatus: state.status,
        trigger: request.trigger,
      })
      const decisionDurationMs = elapsedMs(startedAt, this.clock())
      const modelUsage = AxisModelUsageSchema.parse(generation.usage)
      const proposal = PivotDecisionSchema.parse(generation.output)
      failureEvidence = { decisionDurationMs, error: 'Axis Pivot proposal failed policy validation', modelUsage, proposal }
      validateAxisPivotProposal(proposal, request.trigger, allowedActions)
      const stopReason = projectedAxisPivotStop(state.budget, state.usage, modelUsage, decisionDurationMs, proposal)
      const decision = stopReason ? forcedStopDecision(request, stopReason) : proposal
      const prepared = this.decisions.markCommitting(pending.decisionId, {
        decision,
        decisionDurationMs,
        forced: Boolean(stopReason),
        modelUsage,
        proposal,
        stopReason,
      })
      return this.commitPrepared(prepared)
    } catch (error) {
      const current = this.decisions.get(pending.decisionId)
      if (current?.status === 'deciding') {
        this.decisions.markFailed(pending.decisionId, { ...failureEvidence, error: errorMessage(error) })
      } else if (current?.status === 'committing') {
        const latestState = this.states.get(current.runId)
        if (!sourceStateMatches(latestState, current) && !stateContainsDecision(latestState, current)) {
          this.decisions.markStale(current.decisionId, 'Axis Pivot response is stale because the run revision changed')
        }
      }
      throw error
    }
  }

  recoverInterrupted(): AxisPivotDecisionRecord[] {
    const recovered: AxisPivotDecisionRecord[] = []
    for (const record of this.decisions.listPending()) {
      if (record.status === 'deciding') {
        recovered.push(this.decisions.markInterrupted(
          record.decisionId,
          'Axis Pivot Provider request was interrupted before a decision was returned',
        ))
        continue
      }
      const state = this.states.get(record.runId)
      if (stateContainsDecision(state, record)) {
        recovered.push(this.decisions.complete(record.decisionId))
        continue
      }
      if (!sourceStateMatches(state, record)) {
        recovered.push(this.decisions.markStale(
          record.decisionId,
          'Axis Pivot decision became stale before crash recovery completed',
        ))
        continue
      }
      this.commitState(record)
      recovered.push(this.decisions.complete(record.decisionId))
    }
    return recovered
  }

  private commitPrepared(record: AxisPivotDecisionRecord): AxisPivotDecisionRecord {
    if (!sourceStateMatches(this.states.get(record.runId), record)) {
      this.decisions.markStale(record.decisionId, 'Axis Pivot response is stale because the run revision changed')
      throw new AxisStalePivotError('Axis Pivot response is stale because the run revision changed')
    }
    this.commitState(record)
    return this.decisions.complete(record.decisionId)
  }

  private commitState(record: AxisPivotDecisionRecord): AxisRunState {
    if (!record.decision) throw new Error(`Axis Pivot committing record has no decision: ${record.decisionId}`)
    return this.states.recordPivot({
      decision: record.decision,
      decisionDurationMs: record.decisionDurationMs,
      decisionId: record.decisionId,
      expectedRevision: record.sourceRevision,
      modelUsage: record.modelUsage,
      runId: record.runId,
      sessionId: record.sessionId,
    })
  }

  private requireSourceState(request: AxisPivotRequest): AxisRunState & { status: 'failed' | 'paused' } {
    const state = this.states.get(request.runId)
    if (!state || state.sessionId !== request.sessionId) throw new Error(`Axis Pivot source run not found: ${request.runId}`)
    if (state.revision !== request.expectedRevision) {
      throw new Error(`Axis Pivot source revision conflict: expected ${request.expectedRevision}, current ${state.revision}`)
    }
    if (state.status !== 'failed' && state.status !== 'paused') {
      throw new Error(`Axis Pivot decision requires a failed or paused run, received ${state.status}`)
    }
    return state as AxisRunState & { status: 'failed' | 'paused' }
  }
}

class AxisStalePivotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AxisStalePivotError'
  }
}

function requireTriggerTask(state: AxisRunState, request: AxisPivotRequest): void {
  if (request.trigger.taskId && !state.tasks.some((task) => task.taskId === request.trigger.taskId)) {
    throw new Error(`Axis Pivot trigger task not found: ${request.trigger.taskId}`)
  }
}

function sourceStateMatches(state: AxisRunState | null, record: AxisPivotDecisionRecord): boolean {
  return Boolean(
    state
    && state.sessionId === record.sessionId
    && state.revision === record.sourceRevision
    && state.status === record.sourceStatus
    && state.objective === record.objective,
  )
}

function stateContainsDecision(state: AxisRunState | null, record: AxisPivotDecisionRecord): boolean {
  return Boolean(
    state
    && state.sessionId === record.sessionId
    && state.revision === record.sourceRevision + 1
    && state.events.at(-1)?.pivotDecisionId === record.decisionId
    && state.events.at(-1)?.type === 'pivot-decided',
  )
}

function forcedStopDecision(request: AxisPivotRequest, stopReason: string): PivotDecision {
  return {
    action: 'stop',
    reason: `Axis hard budget stopped Dynamic Pivot: ${stopReason}`,
    taskId: request.trigger.taskId,
  }
}

function elapsedMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, Math.round(finishedAt.getTime() - startedAt.getTime()))
}

function emptyModelUsage(): AxisModelUsage {
  return { costUsd: 0, tokens: 0 }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
