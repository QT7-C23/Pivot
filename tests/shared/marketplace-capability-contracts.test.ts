import { describe, expect, it } from 'vitest'
import { MarketplaceCapabilityReviewEvidenceSchema } from '../../src/shared/marketplace-capability-contracts'

describe('Marketplace capability review evidence contract', () => {
  it('accepts strict approved evidence and rejects forged approval sets', () => {
    const evidence = {
      approvedCapabilities: ['network.fetch'],
      declaredCapabilities: ['network.fetch'],
      identity: {
        kind: 'plugin', resourceId: 'dev.pivot.example', schemaVersion: 1,
        sourceId: 'official', version: '1.0.0',
      },
      reviewedAt: '2026-08-20T00:00:00.000Z',
      riskLevel: 'medium',
      schemaVersion: 1,
      status: 'approved',
    }
    expect(MarketplaceCapabilityReviewEvidenceSchema.parse(evidence).status).toBe('approved')
    expect(() => MarketplaceCapabilityReviewEvidenceSchema.parse({
      ...evidence,
      approvedCapabilities: ['network.fetch', 'workspace.write'],
    })).toThrow(/approved|declared/i)
    expect(() => MarketplaceCapabilityReviewEvidenceSchema.parse({ ...evidence, injected: true })).toThrow()
  })

  it('requires a bounded reason for rejection and exact approval for approved status', () => {
    const base = {
      approvedCapabilities: [], declaredCapabilities: ['workspace.read'],
      identity: {
        kind: 'skill', resourceId: 'dev.pivot.skill', schemaVersion: 1,
        sourceId: 'official', version: '1.0.0',
      },
      reviewedAt: '2026-08-20T00:00:00.000Z', riskLevel: 'low', schemaVersion: 1,
    }
    expect(() => MarketplaceCapabilityReviewEvidenceSchema.parse({ ...base, status: 'approved' }))
      .toThrow(/exactly|approval/i)
    expect(() => MarketplaceCapabilityReviewEvidenceSchema.parse({ ...base, status: 'rejected' }))
      .toThrow(/reason/i)
  })
})
