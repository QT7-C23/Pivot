import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

let root = ''
let databasePath = ''

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'pivot-axis-state-'))
  databasePath = path.join(root, 'pivot.db')
})

afterEach(async () => {
  await rm(root, { force: true, recursive: true })
})

describe('Axis run-state registry', () => {
  it('persists state across registry restarts', () => {
    const first = new AxisRunStateRegistry(databasePath, { clock: () => new Date('2026-07-22T01:00:00.000Z') })
    first.create(axisShadowResult(), axisBudget())
    first.close()

    const second = new AxisRunStateRegistry(databasePath)
    expect(second.get('run-1')?.status).toBe('planned')
    expect(second.list('session-1').map((state) => state.runId)).toEqual(['run-1'])
    second.close()
  })

  it('enforces optimistic revisions and session ownership for cancel and restart', () => {
    const registry = new AxisRunStateRegistry(databasePath, { clock: sequenceClock() })
    registry.create(axisShadowResult(), axisBudget())

    const cancelled = registry.cancel({ expectedRevision: 1, runId: 'run-1', sessionId: 'session-1' })
    expect(cancelled).toMatchObject({ revision: 2, status: 'cancelled' })
    expect(() => registry.cancel({ expectedRevision: 1, runId: 'run-1', sessionId: 'session-1' })).toThrow(/revision conflict/i)
    expect(() => registry.restart({ expectedRevision: 2, runId: 'run-1', sessionId: 'session-other' })).toThrow(/not found/i)

    const restarted = registry.restart({ expectedRevision: 2, runId: 'run-1', sessionId: 'session-1' })
    expect(restarted).toMatchObject({ restartCount: 1, revision: 3, status: 'planned' })
    expect(restarted.events.map((event) => event.type)).toEqual(['initialized', 'cancelled', 'restarted'])
    registry.close()
  })

  it('atomically claims guarded tasks and rejects stale approvals before execution', () => {
    const registry = new AxisRunStateRegistry(databasePath, { clock: sequenceClock() })
    registry.create(axisShadowResult(), axisBudget())

    const claimed = registry.claimGuardedTask({
      dependencyTaskIds: [],
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'inspect',
    })
    expect(claimed).toMatchObject({ revision: 3, status: 'running' })
    expect(() => registry.claimGuardedTask({
      dependencyTaskIds: [],
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'inspect',
    })).toThrow(/revision conflict/i)

    const completed = registry.finishGuardedTask({
      expectedRevision: claimed.revision,
      result: {
        artifacts: [],
        findings: [],
        status: 'completed',
        summary: 'Completed',
        taskId: 'inspect',
        usage: { costUsd: 0, durationMs: 1, tokens: 0 },
      },
      runId: 'run-1',
      sessionId: 'session-1',
    })
    expect(completed).toMatchObject({ revision: 5, status: 'completed' })
    registry.close()
  })
})

function sequenceClock(): () => Date {
  let second = 0
  return () => new Date(`2026-07-22T01:00:${String(second++).padStart(2, '0')}.000Z`)
}
