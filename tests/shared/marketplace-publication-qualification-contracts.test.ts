import { describe, expect, it } from 'vitest'
import { MarketplacePublicationQualificationSchema } from '../../src/shared/marketplace-publication-qualification-contracts'

describe('Marketplace publication qualification contract', () => {
  it('requires blockers whenever publication is not ready', () => {
    expect(() => MarketplacePublicationQualificationSchema.parse({
      blockers: [], checkedAt: '2026-08-20T00:00:00.000Z', ready: false, schemaVersion: 1,
    })).toThrow(/blocker/i)
    expect(MarketplacePublicationQualificationSchema.parse({
      blockers: [], catalogRevision: 4, checkedAt: '2026-08-20T00:00:00.000Z', ready: true, schemaVersion: 1,
    })).toMatchObject({ ready: true })
  })
})
