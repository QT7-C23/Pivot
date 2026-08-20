import { describe, expect, it } from 'vitest'
import {
  AxisRunStateSchema,
} from '../../src/shared/axis-engine-contracts'
import {
  completeAxisGuardedTask,
  createAxisRunState,
  recordAxisSafeWriteProposalUsage,
  startAxisGuardedTask,
  transitionAxisRunState,
} from '../../src/shared/axis-run-state'
import { axisBudget, axisShadowResult, emptyUsage } from '../fixtures/axis-shadow-run'

describe('Axis run-state contracts', () => {
  it('creates one pending task state for every planned DAG task', () => {
    const state = createAxisRunState(axisShadowResult(), axisBudget(), '2026-07-22T01:00:00.000Z')

    expect(state).toMatchObject({ events: [{ revision: 1, type: 'initialized' }], revision: 1, restartCount: 0, status: 'planned' })
    expect(state.tasks).toEqual([
      { attempts: 0, error: null, status: 'pending', taskId: 'inspect', updatedAt: '2026-07-22T01:00:00.000Z', usage: emptyUsage() },
    ])
    expect(AxisRunStateSchema.parse(state)).toEqual(state)
  })

  it('cancels and reopens deterministically without granting execution authority', () => {
    const initial = createAxisRunState(axisShadowResult(), axisBudget(), '2026-07-22T01:00:00.000Z')
    const cancelled = transitionAxisRunState(initial, 'cancel', '2026-07-22T01:01:00.000Z')
    const reopened = transitionAxisRunState(cancelled, 'restart', '2026-07-22T01:02:00.000Z')

    expect(cancelled).toMatchObject({ revision: 2, status: 'cancelled', tasks: [{ status: 'cancelled' }] })
    expect(reopened).toMatchObject({ restartCount: 1, revision: 3, status: 'planned', tasks: [{ status: 'pending' }] })
    expect(reopened.events.map((event) => event.type)).toEqual(['initialized', 'cancelled', 'restarted'])
    expect(() => transitionAxisRunState(initial, 'restart', '2026-07-22T01:03:00.000Z')).toThrow(/cancelled or failed/i)
  })

  it('atomically claims and completes a guarded task with explicit lifecycle evidence', () => {
    const initial = createAxisRunState(axisShadowResult(), axisBudget(), '2026-07-22T02:00:00.000Z')
    const running = startAxisGuardedTask(initial, 'inspect', [], '2026-07-22T02:00:01.000Z')
    const completed = completeAxisGuardedTask(running, {
      artifacts: [{ id: 'write-1', path: 'src/one.ts', type: 'file' }],
      findings: [],
      status: 'completed',
      summary: 'Guarded write and Gates completed',
      taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 10, tokens: 0 },
    }, '2026-07-22T02:00:02.000Z')

    expect(running).toMatchObject({
      revision: 3,
      status: 'running',
      tasks: [{ attempts: 1, status: 'running' }],
    })
    expect(completed).toMatchObject({
      revision: 5,
      status: 'completed',
      tasks: [{ status: 'completed' }],
    })
    expect(completed.events.map((event) => event.type)).toEqual([
      'initialized',
      'guarded-execution-started',
      'task-started',
      'task-completed',
      'completed',
    ])
  })

  it('rejects guarded claims with unfinished dependencies or another running task', () => {
    const plan = axisShadowResult()
    plan.dag!.tasks.push({
      assignedFiles: ['src/two.ts'],
      dependencies: ['inspect'],
      estimatedComplexity: 1,
      id: 'write',
      objective: 'Write',
      requiredTools: ['fs.safeWrite'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      spawnDepth: 1,
      title: 'Write',
    })
    plan.schedule = {
      batches: [['inspect'], ['write']],
      orderedTaskIds: ['inspect', 'write'],
      warnings: [],
    }
    const initial = createAxisRunState(plan, axisBudget(), '2026-07-22T03:00:00.000Z')

    expect(() => startAxisGuardedTask(
      initial,
      'write',
      ['inspect'],
      '2026-07-22T03:00:01.000Z',
    )).toThrow(/dependencies/i)
    const running = startAxisGuardedTask(
      initial,
      'inspect',
      [],
      '2026-07-22T03:00:01.000Z',
    )
    expect(() => startAxisGuardedTask(
      running,
      'write',
      ['inspect'],
      '2026-07-22T03:00:02.000Z',
    )).toThrow(/already running/i)
  })

  it('accounts proposal-model usage atomically and hard-stops an exceeded budget', () => {
    const initial = createAxisRunState(
      axisShadowResult(),
      axisBudget(),
      '2026-07-22T04:00:00.000Z',
    )
    const accounted = recordAxisSafeWriteProposalUsage(
      initial,
      'inspect',
      { costUsd: 0.01, tokens: 100 },
      25,
      '2026-07-22T04:00:01.000Z',
    )

    expect(accounted).toMatchObject({
      events: [
        { type: 'initialized' },
        { taskId: 'inspect', type: 'safe-write-proposal-usage-recorded' },
      ],
      revision: 2,
      status: 'planned',
      tasks: [{ status: 'pending', usage: { costUsd: 0.01, durationMs: 25, tokens: 100 } }],
      usage: { costUsd: 0.01, durationMs: 25, tokens: 100 },
    })

    const stopped = recordAxisSafeWriteProposalUsage(
      initial,
      'inspect',
      { costUsd: initial.budget.maxCostUsd + 1, tokens: 1 },
      1,
      '2026-07-22T04:00:02.000Z',
    )
    expect(stopped).toMatchObject({
      events: [
        { type: 'initialized' },
        { detail: 'cost-limit', type: 'safe-write-proposal-stopped' },
      ],
      revision: 2,
      status: 'failed',
      tasks: [{ error: 'Axis safe-write proposal exceeded cost-limit', status: 'failed' }],
    })
  })
})
