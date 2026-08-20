import { describe, expect, it } from 'vitest'
import type { AxisRunState } from '../../src/shared/axis-engine-contracts'
import {
  scheduleAxisPivotAssignedTask,
} from '../../src/shared/axis-run-state'

describe('Axis Pivot assignment scheduling state', () => {
  it.each([
    ['self-repair', 'pivot-self-repair-scheduled', 1],
    ['dedicated-fixer', 'pivot-dedicated-fixer-scheduled', 0],
  ] as const)(
    'reopens only the decision-owned failed task for %s',
    (action, eventType, retryDelta) => {
      const state = failedDecisionState(action)

      const next = scheduleAxisPivotAssignedTask(
        state,
        'decision-1',
        'task-1',
        action,
        '2026-08-02T01:00:01.000Z',
      )

      expect(next).toMatchObject({
        revision: state.revision + 1,
        status: 'running',
        usage: {
          retriesForTask: state.usage.retriesForTask + retryDelta,
        },
      })
      expect(next.tasks).toEqual([
        expect.objectContaining({
          error: null,
          status: 'pending',
          taskId: 'task-1',
        }),
      ])
      expect(next.events.at(-1)).toMatchObject({
        pivotDecisionId: 'decision-1',
        revision: state.revision + 1,
        taskId: 'task-1',
        type: eventType,
      })
    },
  )

  it('rejects wrong ownership, wrong state, and exhausted self-repair retry budget', () => {
    const state = failedDecisionState('self-repair')
    expect(() => scheduleAxisPivotAssignedTask(
      state,
      'decision-other',
      'task-1',
      'self-repair',
      '2026-08-02T01:00:01.000Z',
    )).toThrow(/decision/i)
    expect(() => scheduleAxisPivotAssignedTask(
      { ...state, status: 'running' },
      'decision-1',
      'task-1',
      'self-repair',
      '2026-08-02T01:00:01.000Z',
    )).toThrow(/failed/i)
    expect(() => scheduleAxisPivotAssignedTask(
      {
        ...state,
        budget: { ...state.budget, maxRetriesPerTask: 0 },
      },
      'decision-1',
      'task-1',
      'self-repair',
      '2026-08-02T01:00:01.000Z',
    )).toThrow(/retry|limit/i)
  })
})

function failedDecisionState(
  action: 'self-repair' | 'dedicated-fixer',
): AxisRunState {
  const timestamp = '2026-08-02T01:00:00.000Z'
  return {
    budget: {
      maxCostUsd: 10,
      maxDurationMs: 10_000,
      maxGateCyclesPerFile: 3,
      maxPivots: 3,
      maxRetriesPerTask: 2,
      maxTokens: 10_000,
      maxWorkers: 2,
    },
    createdAt: timestamp,
    events: [
      { detail: '', revision: 1, taskId: null, timestamp, type: 'initialized' },
      {
        detail: `${action}: repair`,
        pivotDecisionId: 'decision-1',
        revision: 2,
        taskId: 'task-1',
        timestamp,
        type: 'pivot-decided',
      },
    ],
    objective: 'Repair the failed task',
    restartCount: 0,
    revision: 2,
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'failed',
    tasks: [{
      attempts: 1,
      error: 'failed',
      status: 'failed',
      taskId: 'task-1',
      updatedAt: timestamp,
      usage: {
        costUsd: 0,
        durationMs: 1,
        gateCyclesForFile: 0,
        pivots: 0,
        retriesForTask: 0,
        tokens: 1,
      },
    }],
    updatedAt: timestamp,
    usage: {
      costUsd: 0,
      durationMs: 1,
      gateCyclesForFile: 0,
      pivots: 1,
      retriesForTask: 0,
      tokens: 1,
    },
  }
}
