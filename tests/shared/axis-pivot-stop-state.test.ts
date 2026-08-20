import { describe, expect, it } from 'vitest'
import {
  AxisRunStateSchema,
} from '../../src/shared/axis-engine-contracts'
import {
  completeAxisTask,
  createAxisRunState,
  pauseAxisRunState,
  recordAxisPivotDecision,
  startAxisDryRun,
  startAxisTask,
  stopAxisPivotRun,
} from '../../src/shared/axis-run-state'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot stop state', () => {
  it('preserves terminal task evidence and records a decision-bound stop event', () => {
    const decided = failedStopDecision()

    const stopped = stopAxisPivotRun(
      decided,
      'pivot-stop-1',
      'inspect',
      'Stop after the failed direction',
      '2026-07-30T00:00:05.000Z',
    )

    expect(stopped).toMatchObject({
      revision: decided.revision + 1,
      status: 'stopped',
      tasks: [{ error: 'Worker failed', status: 'failed', taskId: 'inspect' }],
      usage: decided.usage,
    })
    expect(stopped.events.at(-1)).toMatchObject({
      detail: 'Stop after the failed direction',
      pivotDecisionId: 'pivot-stop-1',
      revision: decided.revision + 1,
      taskId: 'inspect',
      type: 'pivot-stopped',
    })
  })

  it('cancels unfinished task state when stopping a paused Run', () => {
    const decided = pausedStopDecision()

    const stopped = stopAxisPivotRun(
      decided,
      'pivot-stop-paused',
      null,
      'Stop the paused design',
      '2026-07-30T00:00:05.000Z',
    )

    expect(stopped.status).toBe('stopped')
    expect(stopped.tasks[0]).toMatchObject({
      attempts: 1,
      error: null,
      status: 'cancelled',
      taskId: 'inspect',
    })
  })

  it('rejects a mismatched latest decision without changing source state', () => {
    const decided = failedStopDecision()

    expect(() => stopAxisPivotRun(
      decided,
      'pivot-other',
      'inspect',
      'forged',
      '2026-07-30T00:00:05.000Z',
    )).toThrow(/decision/i)
    expect(decided.status).toBe('failed')
    expect(decided.events.at(-1)?.type).toBe('pivot-decided')
  })

  it('keeps planning-budget stopped states distinct from Pivot-stopped states', () => {
    const decided = failedStopDecision()
    expect(() => AxisRunStateSchema.parse({
      ...decided,
      status: 'stopped',
    })).toThrow(/pivot|stopped|task/i)

    const planningStopped = createAxisRunState(
      {
        ...axisShadowResult('run-budget-stop', 'session-1'),
        dag: null,
        schedule: null,
        status: 'stopped',
        stopReason: 'token-limit',
      },
      axisBudget(),
      '2026-07-30T00:00:00.000Z',
    )
    expect(planningStopped).toMatchObject({ status: 'stopped', tasks: [] })
  })
})

function failedStopDecision() {
  let state = createAxisRunState(
    axisShadowResult('run-stop', 'session-1'),
    { ...axisBudget(), maxPivots: 3 },
    '2026-07-30T00:00:00.000Z',
  )
  state = startAxisDryRun(state, ['inspect'], '2026-07-30T00:00:01.000Z')
  state = startAxisTask(state, 'inspect', '2026-07-30T00:00:02.000Z')
  state = completeAxisTask(state, {
    artifacts: [],
    findings: [],
    status: 'failed',
    summary: 'Worker failed',
    taskId: 'inspect',
    usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
  }, '2026-07-30T00:00:03.000Z')
  return recordAxisPivotDecision(
    state,
    'pivot-stop-1',
    { action: 'stop', reason: 'Stop after the failed direction', taskId: 'inspect' },
    { costUsd: 0.01, tokens: 10 },
    10,
    '2026-07-30T00:00:04.000Z',
  )
}

function pausedStopDecision() {
  let state = createAxisRunState(
    axisShadowResult('run-stop-paused', 'session-1'),
    { ...axisBudget(), maxPivots: 3 },
    '2026-07-30T00:00:00.000Z',
  )
  state = startAxisDryRun(state, ['inspect'], '2026-07-30T00:00:01.000Z')
  state = startAxisTask(state, 'inspect', '2026-07-30T00:00:02.000Z')
  state = pauseAxisRunState(
    state,
    'time-limit',
    '2026-07-30T00:00:03.000Z',
  )
  return recordAxisPivotDecision(
    state,
    'pivot-stop-paused',
    { action: 'stop', reason: 'Stop the paused design', taskId: null },
    { costUsd: 0.01, tokens: 10 },
    10,
    '2026-07-30T00:00:04.000Z',
  )
}
