import { describe, expect, it, vi } from 'vitest'
import { createAttentionClient } from '../../src/renderer/services/attention-client'

const record = {
  contextLabel: 'Local Executable', createdAt: '2026-08-03T12:00:00.000Z',
  detail: 'Stopped', id: '11111111-1111-4111-8111-111111111111', kind: 'runtime' as const,
  resolvedAt: null, revision: 1, schemaVersion: 1 as const, severity: 'error' as const,
  sourceId: 'runtime:error', status: 'open' as const, title: 'Runtime connection lost',
  updatedAt: '2026-08-03T12:00:00.000Z',
}

describe('durable Attention Renderer client', () => {
  it('uses only typed channels and validates every Main response', async () => {
    const invoke = vi.fn(async (channel: string) => channel === 'attention:list' ? [record] : record)
    const client = createAttentionClient(invoke)
    expect(await client.list()).toEqual([record])
    expect(await client.observe({
      contextLabel: record.contextLabel, detail: record.detail, kind: record.kind,
      severity: record.severity, sourceId: record.sourceId, title: record.title,
    })).toEqual(record)
    expect(await client.resolve({ attentionId: record.id, expectedRevision: 1 })).toEqual(record)
    expect(await client.reopen({ attentionId: record.id, expectedRevision: 1 })).toEqual(record)
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      'attention:list', 'attention:observe', 'attention:resolve', 'attention:reopen',
    ])
  })

  it('fails closed on malformed Main history', async () => {
    const client = createAttentionClient(async () => [{ ...record, status: 'forged' }])
    await expect(client.list()).rejects.toThrow()
  })
})
