import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AxisPivotDispatchRegistry,
} from '../../src/main/services/axis-pivot-dispatch-registry'

describe('Axis Pivot dispatch registry', () => {
  it('persists one strict dispatch result and recovers it after reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-dispatch-registry-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = new AxisPivotDispatchRegistry(databasePath)
      const saved = registry.save(stopDispatch())

      expect(registry.find('decision-1')).toEqual(saved)
      expect(() => registry.save(stopDispatch())).toThrow(/decision|dispatch|recorded/i)
      registry.close()

      const reopened = new AxisPivotDispatchRegistry(databasePath)
      expect(reopened.find('decision-1')).toEqual(saved)
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('deletes only the requested Session results', () => {
    const registry = new AxisPivotDispatchRegistry(':memory:')
    registry.save(stopDispatch())
    registry.save(stopDispatch({
      decisionId: 'decision-2',
      runId: 'run-2',
      sessionId: 'session-2',
    }))

    registry.deleteForSession('session-1')

    expect(registry.find('decision-1')).toBeNull()
    expect(registry.find('decision-2')).not.toBeNull()
    registry.close()
  })

  it('rejects malformed result evidence before persistence', () => {
    const registry = new AxisPivotDispatchRegistry(':memory:')

    expect(() => registry.save({
      ...stopDispatch(),
      result: {
        ...stopDispatch().result,
        decisionId: 'decision-other',
      },
    })).toThrow()
    expect(() => registry.find('')).toThrow()
    registry.close()
  })
})

function stopDispatch(overrides: {
  decisionId?: string
  runId?: string
  sessionId?: string
} = {}) {
  const decisionId = overrides.decisionId ?? 'decision-1'
  const runId = overrides.runId ?? 'run-1'
  const sessionId = overrides.sessionId ?? 'session-1'
  return {
    authority: 'pivot-main-dispatcher' as const,
    decisionId,
    executionRevision: 3,
    result: {
      action: 'stop' as const,
      authority: 'pivot-main' as const,
      decisionId,
      event: {
        detail: 'Stop the Run',
        pivotDecisionId: decisionId,
        revision: 4,
        taskId: 'inspect',
        timestamp: '2026-07-30T00:00:00.000Z',
        type: 'pivot-stopped' as const,
      },
      executionRevision: 3,
      forced: false,
      outcome: 'stopped' as const,
      reason: 'Stop the Run',
      runId,
      schemaVersion: 1 as const,
      sessionId,
      stateRevision: 4,
      stopReason: null,
      taskId: 'inspect',
    },
    route: 'terminal' as const,
    runId,
    schemaVersion: 1 as const,
    sessionId,
  }
}
