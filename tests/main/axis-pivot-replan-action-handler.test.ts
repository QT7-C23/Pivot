import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotReplanActionHandler } from '../../src/main/services/axis-pivot-replan-action-handler'
import type {
  AxisPivotPlanningContextPort,
  AxisPivotReplanPort,
  AxisPivotReplanPortResult,
} from '../../src/main/services/axis-pivot-action-ports'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import {
  AxisPivotDecisionRecordSchema,
  AxisRunStateSchema,
  type AxisPivotAction,
  type AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot replan action handler', () => {
  it('executes a decided paused-run replan with authoritative context and remaining budget', async () => {
    const harness = await decidedHarness('replan')
    const context = contextPort()
    const replans = replanPort(replanResult(harness.state))
    const handler = new AxisPivotReplanActionHandler({
      contexts: context,
      decisions: { find: (decisionId) => harness.decisions.get(decisionId) },
      replans,
      states: { find: ({ runId, sessionId }) => ownedState(harness.states.get(runId), sessionId) },
    })

    const result = await handler.execute(actionRequest(harness.state))

    expect(context.resolve).toHaveBeenCalledWith({
      runId: harness.state.runId,
      sessionId: harness.state.sessionId,
    })
    expect(replans.replan).toHaveBeenCalledWith(expect.objectContaining({
      budget: {
        maxCostUsd: harness.state.budget.maxCostUsd - harness.state.usage.costUsd,
        maxDurationMs: harness.state.budget.maxDurationMs - harness.state.usage.durationMs,
        maxGateCyclesPerFile: harness.state.budget.maxGateCyclesPerFile - harness.state.usage.gateCyclesForFile,
        maxPivots: harness.state.budget.maxPivots - harness.state.usage.pivots,
        maxRetriesPerTask: harness.state.budget.maxRetriesPerTask - harness.state.usage.retriesForTask,
        maxTokens: harness.state.budget.maxTokens - harness.state.usage.tokens,
        maxWorkers: harness.state.budget.maxWorkers,
      },
      context: { availableFiles: ['src/main/axis.ts'], constraints: ['Dynamic Pivot replan only'] },
      expectedRevision: harness.state.revision,
      parentRunId: harness.state.runId,
      sessionId: harness.state.sessionId,
    }))
    expect(result).toMatchObject({
      decisionId: harness.decisionId,
      executionRevision: harness.state.revision,
      outcome: 'created',
    })
    harness.close()
  })

  it('fails closed for a non-replan decision before resolving project context', async () => {
    const harness = await decidedHarness('self-repair')
    const context = contextPort()
    const replans = replanPort(replanResult(harness.state))
    const handler = actionHandler(harness, context, replans)

    await expect(handler.execute(actionRequest(harness.state))).rejects.toThrow(/replan/i)

    expect(context.resolve).not.toHaveBeenCalled()
    expect(replans.replan).not.toHaveBeenCalled()
    harness.close()
  })

  it('rejects stale post-decision revisions before invoking the action Port', async () => {
    const harness = await decidedHarness('replan')
    const context = contextPort()
    const replans = replanPort(replanResult(harness.state))
    const handler = actionHandler(harness, context, replans)

    await expect(handler.execute({
      ...actionRequest(harness.state),
      expectedRevision: harness.state.revision - 1,
    })).rejects.toThrow(/revision/i)

    expect(replans.replan).not.toHaveBeenCalled()
    harness.close()
  })

  it('rejects a state Port response owned by another Session', async () => {
    const harness = await decidedHarness('replan')
    const wrongOwner = AxisRunStateSchema.parse({
      ...harness.state,
      sessionId: 'session-other',
    })
    const context = contextPort()
    const replans = replanPort(replanResult(harness.state))
    const handler = new AxisPivotReplanActionHandler({
      contexts: context,
      decisions: { find: (decisionId) => harness.decisions.get(decisionId) },
      replans,
      states: { find: () => wrongOwner },
    })

    await expect(handler.execute(actionRequest(harness.state))).rejects.toThrow(/ownership/i)

    expect(context.resolve).not.toHaveBeenCalled()
    expect(replans.replan).not.toHaveBeenCalled()
    harness.close()
  })

  it('refuses to reset an exhausted parent budget', async () => {
    const harness = await decidedHarness('replan')
    const decision = harness.decisions.get(harness.decisionId)!
    const exhaustedDecision = AxisPivotDecisionRecordSchema.parse({
      ...decision,
      remainingBudget: {
        ...decision.remainingBudget,
        gateCyclesForFile: 0,
      },
      usageBefore: {
        ...decision.usageBefore,
        gateCyclesForFile: decision.budget.maxGateCyclesPerFile,
      },
    })
    const exhausted = AxisRunStateSchema.parse({
      ...harness.state,
      usage: {
        ...harness.state.usage,
        gateCyclesForFile: harness.state.budget.maxGateCyclesPerFile,
      },
    })
    const context = contextPort()
    const replans = replanPort(replanResult(harness.state))
    const handler = new AxisPivotReplanActionHandler({
      contexts: context,
      decisions: { find: () => exhaustedDecision },
      replans,
      states: { find: () => exhausted },
    })

    await expect(handler.execute(actionRequest(harness.state))).rejects.toThrow(/budget/i)

    expect(context.resolve).not.toHaveBeenCalled()
    expect(replans.replan).not.toHaveBeenCalled()
    harness.close()
  })

  it('returns the completed lineage on a repeated action without creating another child Run', async () => {
    const harness = await decidedHarness('replan')
    const existing = replanResult(harness.state)
    const context = contextPort()
    const replans: AxisPivotReplanPort = {
      findCompleted: vi.fn(() => existing),
      replan: vi.fn(async () => existing),
    }
    const handler = actionHandler(harness, context, replans)

    const result = await handler.execute(actionRequest(harness.state))

    expect(result.outcome).toBe('already-completed')
    expect(replans.replan).not.toHaveBeenCalled()
    expect(context.resolve).not.toHaveBeenCalled()
    harness.close()
  })
})

function actionHandler(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
  contexts: AxisPivotPlanningContextPort,
  replans: AxisPivotReplanPort,
): AxisPivotReplanActionHandler {
  return new AxisPivotReplanActionHandler({
    contexts,
    decisions: { find: (decisionId) => harness.decisions.get(decisionId) },
    replans,
    states: { find: ({ runId, sessionId }) => ownedState(harness.states.get(runId), sessionId) },
  })
}

async function decidedHarness(action: AxisPivotAction) {
  const decisions = new AxisPivotDecisionRegistry(':memory:', { clock: sequenceClock() })
  const states = new AxisRunStateRegistry(':memory:', { clock: sequenceClock() })
  const budget = {
    ...axisBudget(),
    maxPivots: 3,
    maxRetriesPerTask: 2,
  }
  let state = states.create(axisShadowResult('run-parent', 'session-1'), budget)
  state = states.startDryRun({
    approvedTaskIds: ['inspect'],
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  })
  state = states.pause({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    stopReason: 'time-limit',
  })
  const decisionId = `pivot-${action}`
  const coordinator = new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: { action, reason: `Route through ${action}`, taskId: 'inspect' },
        usage: { costUsd: 0.01, tokens: 10 },
      })),
    },
    states,
  })
  const category = action === 'self-repair' ? 'minor' : 'design'
  await coordinator.decide({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    trigger: {
      category,
      evidenceIds: ['gate-1'],
      summary: 'Reviewer rejected the current direction',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  return {
    close() {
      decisions.close()
      states.close()
    },
    decisionId,
    decisions,
    state,
    states,
  }
}

function actionRequest(state: AxisRunState) {
  return {
    decisionId: state.events.at(-1)!.pivotDecisionId!,
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  }
}

function contextPort(): AxisPivotPlanningContextPort {
  return {
    resolve: vi.fn(async () => ({
      availableFiles: ['src/main/axis.ts'],
      constraints: ['Dynamic Pivot replan only'],
    })),
  }
}

function replanPort(result: AxisPivotReplanPortResult): AxisPivotReplanPort {
  return {
    findCompleted: vi.fn(() => null),
    replan: vi.fn(async () => result),
  }
}

function replanResult(state: AxisRunState): AxisPivotReplanPortResult {
  const child = axisShadowResult('run-child', state.sessionId)
  return {
    lineage: {
      attemptId: 'replan-action-1',
      budget: {
        maxCostUsd: state.budget.maxCostUsd - state.usage.costUsd,
        maxDurationMs: state.budget.maxDurationMs - state.usage.durationMs,
        maxGateCyclesPerFile: state.budget.maxGateCyclesPerFile - state.usage.gateCyclesForFile,
        maxPivots: state.budget.maxPivots - state.usage.pivots,
        maxRetriesPerTask: state.budget.maxRetriesPerTask - state.usage.retriesForTask,
        maxTokens: state.budget.maxTokens - state.usage.tokens,
        maxWorkers: state.budget.maxWorkers,
      },
      childRunId: child.trace.runId,
      createdAt: '2026-07-29T00:00:00.000Z',
      error: null,
      fileScope: ['src/main/axis.ts'],
      fileScopeDigest: 'a'.repeat(64),
      generation: 2,
      objective: state.objective,
      objectiveDigest: 'b'.repeat(64),
      parentRunId: state.runId,
      rootRunId: state.runId,
      schemaVersion: 1,
      sessionId: state.sessionId,
      sourceRevision: state.revision,
      status: 'completed',
      updatedAt: '2026-07-29T00:00:01.000Z',
    },
    plan: child,
  }
}

function ownedState(state: AxisRunState | null, sessionId: string): AxisRunState | null {
  return state?.sessionId === sessionId ? state : null
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(`2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`)
}
