import { describe, expect, it } from 'vitest'
import {
  AttentionHistorySchema,
  AttentionLifecycleRequestSchema,
  AttentionObservationSchema,
  AttentionRecordSchema,
} from '../../src/shared/attention'

const observation = {
  contextLabel: 'Local Executable',
  detail: 'The active process stopped unexpectedly.',
  kind: 'runtime' as const,
  severity: 'error' as const,
  sourceId: 'runtime:error',
  title: 'Runtime connection lost',
}

describe('durable Attention contracts', () => {
  it('accepts the narrow immutable observation and lifecycle shapes', () => {
    expect(AttentionObservationSchema.parse(observation)).toEqual(observation)
    expect(AttentionLifecycleRequestSchema.parse({
      attentionId: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 2,
    })).toEqual({
      attentionId: '11111111-1111-4111-8111-111111111111',
      expectedRevision: 2,
    })
  })

  it('strictly rejects forged authority, paths and malformed values', () => {
    expect(() => AttentionObservationSchema.parse({
      ...observation,
      databaseHandle: {},
      filePath: 'D:\\secret.txt',
    })).toThrow()
    expect(() => AttentionObservationSchema.parse({ ...observation, sourceId: '', title: '' })).toThrow()
    expect(() => AttentionLifecycleRequestSchema.parse({
      attentionId: 'not-an-id', expectedRevision: 0, force: true,
    })).toThrow()
  })

  it('validates persisted records and bounded history at runtime', () => {
    const record = {
      ...observation,
      createdAt: '2026-08-03T12:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
      resolvedAt: null,
      revision: 1,
      schemaVersion: 1,
      status: 'open' as const,
      updatedAt: '2026-08-03T12:00:00.000Z',
    }
    expect(AttentionRecordSchema.parse(record)).toEqual(record)
    expect(AttentionHistorySchema.parse([record])).toEqual([record])
    expect(() => AttentionRecordSchema.parse({ ...record, status: 'ignored' })).toThrow()
    expect(() => AttentionRecordSchema.parse({ ...record, revision: -1 })).toThrow()
  })
})
