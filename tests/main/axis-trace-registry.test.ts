import { describe, expect, it } from 'vitest'
import { AxisTraceRegistry } from '../../src/main/services/axis-trace-registry'
import type { EngineTrace } from '../../src/shared/axis-engine-contracts'

describe('Axis trace registry', () => {
  it('persists, updates, and scopes traces by session', () => {
    const registry = new AxisTraceRegistry()
    const first = trace('run-1', 'session-1')
    registry.save(first)
    registry.save({ ...first, events: [...first.events, event(2, 'run-completed')] })
    registry.save(trace('run-2', 'session-2'))

    expect(registry.get('run-1')?.events).toHaveLength(2)
    expect(registry.list('session-1').map((item) => item.runId)).toEqual(['run-1'])
    registry.close()
  })

  it('rejects invalid traces before they reach storage', () => {
    const registry = new AxisTraceRegistry()
    expect(() => registry.save({ ...trace('run-1', 'session-1'), events: [event(2, 'run-started')] })).toThrow(/sequence/i)
    registry.close()
  })
})

function trace(runId: string, sessionId: string): EngineTrace {
  return { events: [event(1, 'run-started')], runId, sessionId, startedAt: '2026-07-22T00:00:00.000Z', traceId: `trace-${runId}` }
}

function event(sequence: number, type: EngineTrace['events'][number]['type']): EngineTrace['events'][number] {
  return { detail: type, sequence, taskId: null, timestamp: '2026-07-22T00:00:00.000Z', type }
}
