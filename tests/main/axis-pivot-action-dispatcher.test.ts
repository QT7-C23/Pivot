import { describe, expect, it, vi } from 'vitest'
import { AxisPivotActionDispatcher } from '../../src/main/services/axis-pivot-action-dispatcher'
import { axisRemainingBudget } from '../../src/main/services/axis-pivot-policy'
import {
  AxisPivotDecisionRecordSchema,
  type AxisPivotAction,
  type AxisPivotDecisionRecord,
} from '../../src/shared/axis-engine-contracts'
import { axisBudget } from '../fixtures/axis-shadow-run'

const ACTIONS: AxisPivotAction[] = [
  'replan',
  'retry',
  'self-repair',
  'dedicated-fixer',
  'discard',
  'escalate',
  'stop',
]

describe('Axis Pivot action dispatcher', () => {
  it.each(ACTIONS)('routes %s only to its decision-selected action Port', async (action) => {
    const record = decisionRecord(action)
    const executors = executorSet()
    executors[action].execute.mockRejectedValueOnce(new Error(`selected:${action}`))
    const dispatcher = new AxisPivotActionDispatcher({
      decisions: { find: () => record },
      executors,
    })

    await expect(dispatcher.dispatch(request())).rejects.toThrow(`selected:${action}`)
    for (const candidate of ACTIONS) {
      expect(executors[candidate].execute).toHaveBeenCalledTimes(
        candidate === action ? 1 : 0,
      )
    }
  })

  it('returns strictly validated continuation and terminal envelopes', async () => {
    const retryExecutors = executorSet()
    retryExecutors.retry.execute.mockResolvedValue(retryResult())
    const retry = await new AxisPivotActionDispatcher({
      decisions: { find: () => decisionRecord('retry') },
      executors: retryExecutors,
    }).dispatch(request())

    expect(retry).toMatchObject({
      authority: 'pivot-main-dispatcher',
      route: 'continuation',
      result: { action: 'retry' },
    })

    const stopExecutors = executorSet()
    stopExecutors.stop.execute.mockResolvedValue(stopResult())
    const stop = await new AxisPivotActionDispatcher({
      decisions: { find: () => decisionRecord('stop') },
      executors: stopExecutors,
    }).dispatch(request())

    expect(stop).toMatchObject({
      authority: 'pivot-main-dispatcher',
      route: 'terminal',
      result: { action: 'stop' },
    })
  })

  it('fails before dispatch for malformed, undecided, cross-owner, or stale requests', async () => {
    const executors = executorSet()
    const valid = decisionRecord('retry')
    const cases: Array<{
      decision: AxisPivotDecisionRecord | null
      input?: ReturnType<typeof request>
    }> = [
      { decision: null },
      { decision: { ...valid, status: 'deciding', decision: null } },
      { decision: valid, input: { ...request(), sessionId: 'session-other' } },
      { decision: valid, input: { ...request(), expectedRevision: 2 } },
    ]

    for (const testCase of cases) {
      const dispatcher = new AxisPivotActionDispatcher({
        decisions: { find: () => testCase.decision },
        executors,
      })
      await expect(dispatcher.dispatch(testCase.input ?? request())).rejects.toThrow()
    }
    expect(ACTIONS.every((action) => (
      executors[action].execute.mock.calls.length === 0
    ))).toBe(true)
  })

  it('rejects malformed or mismatched action Port output', async () => {
    const executors = executorSet()
    executors.retry.execute.mockResolvedValue({
      ...retryResult(),
      decisionId: 'decision-other',
    })
    const dispatcher = new AxisPivotActionDispatcher({
      decisions: { find: () => decisionRecord('retry') },
      executors,
    })

    await expect(dispatcher.dispatch(request())).rejects.toThrow()
  })

  it('rejects a valid same-route result for a different committed action', async () => {
    const executors = executorSet()
    executors.replan.execute.mockResolvedValue(retryResult())
    const dispatcher = new AxisPivotActionDispatcher({
      decisions: { find: () => decisionRecord('replan') },
      executors,
    })

    await expect(dispatcher.dispatch(request())).rejects.toThrow(/action/i)
  })
})

function executorSet() {
  return {
    'dedicated-fixer': { execute: vi.fn() },
    discard: { execute: vi.fn() },
    escalate: { execute: vi.fn() },
    replan: { execute: vi.fn() },
    retry: { execute: vi.fn() },
    'self-repair': { execute: vi.fn() },
    stop: { execute: vi.fn() },
  }
}

function decisionRecord(action: AxisPivotAction): AxisPivotDecisionRecord {
  const budget = axisBudget()
  const usageBefore = {
    costUsd: 0,
    durationMs: 0,
    gateCyclesForFile: 0,
    pivots: 0,
    retriesForTask: 0,
    tokens: 0,
  }
  return AxisPivotDecisionRecordSchema.parse({
    allowedActions: action === 'stop' ? ['stop'] : [action, 'stop'],
    budget,
    createdAt: '2026-07-30T00:00:00.000Z',
    decision: {
      action,
      reason: `Decision ${action}`,
      taskId: 'task-1',
    },
    decisionDurationMs: 10,
    decisionId: 'decision-1',
    error: null,
    forced: false,
    modelUsage: { costUsd: 0.01, tokens: 10 },
    objective: 'Dispatch the committed action',
    proposal: {
      action,
      reason: `Decision ${action}`,
      taskId: 'task-1',
    },
    remainingBudget: axisRemainingBudget(budget, usageBefore),
    runId: 'run-1',
    schemaVersion: 1,
    sequence: 1,
    sessionId: 'session-1',
    sourceRevision: 2,
    sourceStatus: 'failed',
    status: 'decided',
    stopReason: null,
    trigger: {
      category: 'direction',
      evidenceIds: ['evidence-1'],
      summary: 'Dispatch evidence',
      taskId: 'task-1',
    },
    updatedAt: '2026-07-30T00:00:00.010Z',
    usageBefore,
  })
}

function request() {
  return {
    decisionId: 'decision-1',
    expectedRevision: 3,
    runId: 'run-1',
    sessionId: 'session-1',
  }
}

function retryResult() {
  return {
    action: 'retry' as const,
    authority: 'pivot-main' as const,
    decisionId: 'decision-1',
    event: {
      detail: 'Retry scheduled by Dynamic Pivot',
      pivotDecisionId: 'decision-1',
      revision: 4,
      taskId: 'task-1',
      timestamp: '2026-07-30T00:00:00.020Z',
      type: 'pivot-retry-scheduled' as const,
    },
    executionRevision: 3,
    outcome: 'scheduled' as const,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    stateRevision: 4,
    taskId: 'task-1',
  }
}

function stopResult() {
  return {
    action: 'stop' as const,
    authority: 'pivot-main' as const,
    decisionId: 'decision-1',
    event: {
      detail: 'Decision stop',
      pivotDecisionId: 'decision-1',
      revision: 4,
      taskId: 'task-1',
      timestamp: '2026-07-30T00:00:00.020Z',
      type: 'pivot-stopped' as const,
    },
    executionRevision: 3,
    forced: false,
    outcome: 'stopped' as const,
    reason: 'Decision stop',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    stateRevision: 4,
    stopReason: null,
    taskId: 'task-1',
  }
}
