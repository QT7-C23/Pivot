import { describe, expect, it } from 'vitest'
import { MarketplacePublicationQualificationService } from '../../src/main/services/marketplace-publication-qualification-service'

describe('Marketplace publication qualification', () => {
  it('blocks an empty catalog, pending recovery and plugin code without an isolated sandbox', async () => {
    const empty = await service([]).qualify()
    expect(empty.ready).toBe(false)
    expect(empty.blockers.map(({ code }) => code)).toContain('catalog-empty')

    const blocked = await service([entry('plugin')], true).qualify()
    expect(blocked.ready).toBe(false)
    expect(blocked.blockers.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'plugin-sandbox-unavailable', 'installation-recovery-pending',
    ]))
  })

  it('qualifies a non-code catalog only when it is current and recovery is clean', async () => {
    const result = await service([entry('theme'), entry('prompt')]).qualify()
    expect(result).toEqual({
      blockers: [], catalogRevision: 9, checkedAt: '2026-08-20T00:00:00.000Z', ready: true, schemaVersion: 1,
    })
  })

  it('fails closed when the verified catalog cannot be read', async () => {
    const result = await new MarketplacePublicationQualificationService({
      catalog: { readSnapshot: async () => { throw new Error('offline') } },
      clock: () => new Date('2026-08-20T00:00:00.000Z'),
      installations: { get: () => null, listInstalled: () => [], listRecoverable: () => [] },
    }).qualify()
    expect(result.blockers.map(({ code }) => code)).toContain('catalog-unavailable')
  })
})

function service(entries: unknown[], recoverable = false) {
  return new MarketplacePublicationQualificationService({
    activeKinds: ['prompt', 'skill', 'theme'],
    catalog: { readSnapshot: async () => ({ entries, expiresAt: '2026-08-24T00:00:00.000Z', revision: 9 }) as never },
    clock: () => new Date('2026-08-20T00:00:00.000Z'),
    installations: { get: () => null, listInstalled: () => [], listRecoverable: () => recoverable ? [{} as never] : [] },
  })
}

function entry(kind: 'plugin' | 'prompt' | 'theme') { return { kind } }
