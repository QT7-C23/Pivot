import { describe, expect, it } from 'vitest'
import {
  AgentRunEventAppendSchema,
  AgentRunEventSchema,
} from '../../src/shared/agent-run-events'

describe('Agent Run Event contracts', () => {
  it('accepts strict bounded event inputs and persisted records', () => {
    const input = AgentRunEventAppendSchema.parse({
      data: { adapterId: 'local', profileId: null, toolPolicy: 'full' },
      runId: 'run-1',
      sessionId: 'session-1',
      type: 'run-started',
    })
    expect(input.type).toBe('run-started')
    expect(AgentRunEventSchema.parse({
      ...input,
      eventId: 'event-1',
      occurredAt: '2026-08-14T00:00:00.000Z',
      schemaVersion: 1,
      sequence: 1,
    })).toMatchObject({ eventId: 'event-1', sequence: 1 })
  })

  it('rejects unknown fields, mismatched payloads and unbounded identifiers', () => {
    expect(() => AgentRunEventAppendSchema.parse({
      data: { responseBytes: 0, status: 'completed', errorName: null },
      injected: true,
      runId: 'run-1', sessionId: 'session-1', type: 'run-finished',
    })).toThrow()
    expect(() => AgentRunEventAppendSchema.parse({
      data: { adapterId: 'local' },
      runId: 'run-1', sessionId: 'session-1', type: 'tool-started',
    })).toThrow()
    expect(() => AgentRunEventAppendSchema.parse({
      data: { adapterId: 'local', profileId: null, toolPolicy: 'full' },
      runId: `run-${'x'.repeat(200)}`, sessionId: 'session-1', type: 'run-started',
    })).toThrow()
    expect(() => AgentRunEventSchema.parse({
      data: { adapterId: 'local', profileId: null, toolPolicy: 'full' },
      eventId: 'event-1', occurredAt: '0', runId: 'run-1', schemaVersion: 1,
      sequence: 1, sessionId: 'session-1', type: 'run-started',
    })).toThrow()
  })
})
