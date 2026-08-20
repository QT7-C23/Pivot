import { describe, expect, it } from 'vitest'
import { MarketplaceUpdateRecordSchema } from '../../src/shared/marketplace-update-contracts'

describe('Marketplace update contracts', () => {
  it('requires distinct versions of the same logical resource', () => {
    const current = identity('1.0.0')
    expect(MarketplaceUpdateRecordSchema.parse({
      candidate: { identity: identity('1.1.0'), installationRevision: 1 },
      createdAt: '2026-08-20T00:00:00.000Z',
      current: { identity: current, installationRevision: 1 },
      revision: 0,
      schemaVersion: 1,
      state: 'ready',
      updateId: 'update-1',
      updatedAt: '2026-08-20T00:00:00.000Z',
    })).toMatchObject({ state: 'ready' })
    expect(() => MarketplaceUpdateRecordSchema.parse({
      candidate: { identity: current, installationRevision: 1 },
      createdAt: '2026-08-20T00:00:00.000Z', current: { identity: current, installationRevision: 1 },
      revision: 0, schemaVersion: 1, state: 'ready', updateId: 'update-1',
      updatedAt: '2026-08-20T00:00:00.000Z',
    })).toThrow(/version|distinct/i)
  })
})

function identity(version: string) {
  return { kind: 'theme' as const, resourceId: 'dev.pivot.theme', schemaVersion: 1 as const, sourceId: 'official', version }
}
