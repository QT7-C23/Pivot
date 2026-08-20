import { describe, expect, it } from 'vitest'
import {
  completeAxisTask,
  createAxisRunState,
  recordAxisPivotDecision,
  scheduleAxisPivotTaskRetry,
  startAxisDryRun,
  startAxisTask,
} from '../../src/shared/axis-run-state'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot task retry state', () => {
  it('reopens only the failed task and records one durable retry event', () => {
    const decided = failedDecidedState()

    const retried = scheduleAxisPivotTaskRetry(
      decided,
      'pivot-retry-1',
      'inspect',
      '2026-07-29T00:00:05.000Z',
    )

    expect(retried).toMatchObject({
      revision: decided.revision + 1,
      status: 'running',
      tasks: [{ attempts: 1, error: null, status: 'pending', taskId: 'inspect' }],
      usage: { retriesForTask: 1 },
    })
    expect(retried.events.at(-1)).toMatchObject({
      pivotDecisionId: 'pivot-retry-1',
      revision: decided.revision + 1,
      taskId: 'inspect',
      type: 'pivot-retry-scheduled',
    })
  })

  it('rejects exhausted retry budgets without changing the input state', () => {
    const decided = failedDecidedState({ maxRetriesPerTask: 0 })

    expect(() => scheduleAxisPivotTaskRetry(
      decided,
      'pivot-retry-1',
      'inspect',
      '2026-07-29T00:00:05.000Z',
    )).toThrow(/retry.*limit|budget/i)
    expect(decided.status).toBe('failed')
    expect(decided.tasks[0]).toMatchObject({ error: 'Worker failed', status: 'failed' })
  })

  it('rejects a non-failed task and a mismatched latest Pivot decision', () => {
    const decided = failedDecidedState()
    expect(() => scheduleAxisPivotTaskRetry(
      decided,
      'pivot-other',
      'inspect',
      '2026-07-29T00:00:05.000Z',
    )).toThrow(/decision/i)

    const completedTask = {
      ...decided,
      tasks: decided.tasks.map((task) => ({ ...task, error: null, status: 'completed' as const })),
    }
    expect(() => scheduleAxisPivotTaskRetry(
      completedTask,
      'pivot-retry-1',
      'inspect',
      '2026-07-29T00:00:05.000Z',
    )).toThrow(/failed task/i)
  })
})

function failedDecidedState(budgetOverrides: Partial<ReturnType<typeof axisBudget>> = {}) {
  const budget = {
    ...axisBudget(),
    maxPivots: 3,
    maxRetriesPerTask: 2,
    ...budgetOverrides,
  }
  let state = createAxisRunState(
    axisShadowResult('run-retry', 'session-1'),
    budget,
    '2026-07-29T00:00:00.000Z',
  )
  state = startAxisDryRun(state, ['inspect'], '2026-07-29T00:00:01.000Z')
  state = startAxisTask(state, 'inspect', '2026-07-29T00:00:02.000Z')
  state = completeAxisTask(state, {
    artifacts: [],
    findings: [],
    status: 'failed',
    summary: 'Worker failed',
    taskId: 'inspect',
    usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
  }, '2026-07-29T00:00:03.000Z')
  return recordAxisPivotDecision(
    state,
    'pivot-retry-1',
    { action: 'retry', reason: 'Retry the failed task', taskId: 'inspect' },
    { costUsd: 0.01, tokens: 10 },
    10,
    '2026-07-29T00:00:04.000Z',
  )
}
