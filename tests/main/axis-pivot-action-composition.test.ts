import { describe, expect, it, vi } from 'vitest'
import {
  composeAxisPivotActionDispatcher,
} from '../../src/main/services/axis-pivot-action-composition'
import {
  AxisPivotDecisionRecordSchema,
} from '../../src/shared/axis-engine-contracts'
import { axisRemainingBudget } from '../../src/main/services/axis-pivot-policy'
import { axisBudget } from '../fixtures/axis-shadow-run'

describe('Axis Pivot action composition', () => {
  it('returns one frozen narrow dispatcher Port without exposing executors', async () => {
    const retry = {
      execute: vi.fn(async () => ({
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
      })),
    }
    const unavailable = {
      execute: () => {
        throw new Error('Unexpected Pivot action route')
      },
    }
    const dispatcher = composeAxisPivotActionDispatcher({
      decisions: { find: () => retryDecision() },
      executors: {
        'dedicated-fixer': unavailable,
        discard: unavailable,
        escalate: unavailable,
        replan: unavailable,
        retry,
        'self-repair': unavailable,
        stop: unavailable,
      },
    })

    expect(Object.isFrozen(dispatcher)).toBe(true)
    expect(Object.keys(dispatcher)).toEqual(['dispatch'])
    await expect(dispatcher.dispatch({
      decisionId: 'decision-1',
      expectedRevision: 3,
      runId: 'run-1',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      route: 'continuation',
      result: { action: 'retry' },
    })
    expect(retry.execute).toHaveBeenCalledTimes(1)
  })
})

function retryDecision() {
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
    allowedActions: ['retry', 'stop'],
    budget,
    createdAt: '2026-07-30T00:00:00.000Z',
    decision: {
      action: 'retry',
      reason: 'Retry once',
      taskId: 'task-1',
    },
    decisionDurationMs: 10,
    decisionId: 'decision-1',
    error: null,
    forced: false,
    modelUsage: { costUsd: 0.01, tokens: 10 },
    objective: 'Compose the dispatcher',
    proposal: {
      action: 'retry',
      reason: 'Retry once',
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
      summary: 'Retry evidence',
      taskId: 'task-1',
    },
    updatedAt: '2026-07-30T00:00:00.010Z',
    usageBefore,
  })
}
