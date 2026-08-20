import { describe, expect, it } from 'vitest'
import {
  AxisBlackboardFactDraftSchema,
  AxisBlackboardSnapshotSchema,
  AxisBlackboardValueSchema,
  type AxisBlackboardSnapshot,
} from '../../src/shared/axis-blackboard-contracts'

describe('Axis typed blackboard contracts', () => {
  it('accepts bounded typed values without exposing arbitrary objects', () => {
    expect(AxisBlackboardValueSchema.parse({ type: 'boolean', value: true })).toEqual({
      type: 'boolean',
      value: true,
    })
    expect(AxisBlackboardValueSchema.parse({
      type: 'string-list',
      value: ['src/main/main.ts', 'src/shared/types.ts'],
    }).type).toBe('string-list')
    expect(AxisBlackboardValueSchema.parse({
      type: 'json',
      value: '{"status":"ready"}',
    }).type).toBe('json')
  })

  it('rejects malformed JSON, oversized values, and unknown payload fields', () => {
    expect(() => AxisBlackboardValueSchema.parse({
      type: 'json',
      value: '{not-json}',
    })).toThrow(/JSON/i)

    expect(() => AxisBlackboardValueSchema.parse({
      type: 'text',
      value: 'x'.repeat(16_001),
    })).toThrow()

    expect(() => AxisBlackboardFactDraftSchema.parse({
      factId: 'fact-1',
      key: 'analysis.summary',
      ownerTaskId: 'task-other',
      value: { type: 'text', value: 'A worker cannot choose ownership.' },
      visibility: 'task',
    })).toThrow()
  })

  it('rejects duplicate identifiers and invalid ownership in snapshots', () => {
    const snapshot = validSnapshot()
    snapshot.facts = [fact('fact-1', 'task-1'), fact('fact-1', 'task-2')]
    expect(() => AxisBlackboardSnapshotSchema.parse(snapshot)).toThrow(/unique/i)

    snapshot.facts = [{
      ...fact('fact-2', 'task-1'),
      ownerTaskId: null,
      visibility: 'task',
    }]
    expect(() => AxisBlackboardSnapshotSchema.parse(snapshot)).toThrow(/owner/i)
  })
})

function validSnapshot(): AxisBlackboardSnapshot {
  return {
    createdAt: '2026-07-27T00:00:00.000Z',
    evidence: [],
    facts: [],
    revision: 1,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    updatedAt: '2026-07-27T00:00:00.000Z',
  }
}

function fact(factId: string, ownerTaskId: string) {
  return {
    createdAt: '2026-07-27T00:00:00.000Z',
    factId,
    key: 'analysis.summary',
    ownerTaskId,
    value: { type: 'text' as const, value: 'Summary' },
    visibility: 'task' as const,
  }
}
