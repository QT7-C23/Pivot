import { describe, expect, it } from 'vitest'
import {
  MarketplaceActivationRecordSchema,
  MarketplaceActivationRequestSchema,
} from '../../src/shared/marketplace-activation-contracts'

const identity = {
  kind: 'skill' as const,
  resourceId: 'dev.pivot.review',
  schemaVersion: 1 as const,
  sourceId: 'official',
  version: '1.0.0',
}

describe('Marketplace activation contracts', () => {
  it('strictly validates a revision-bound activation request', () => {
    expect(MarketplaceActivationRequestSchema.parse({
      expectedInstallationRevision: 1,
      identity,
    })).toEqual({ expectedInstallationRevision: 1, identity })
    expect(() => MarketplaceActivationRequestSchema.parse({
      expectedInstallationRevision: 1,
      identity,
      installRoot: 'D:/secret',
    })).toThrow()
  })

  it('rejects duplicate capabilities and malformed registration evidence', () => {
    expect(() => MarketplaceActivationRecordSchema.parse({
      activatedAt: '2026-08-20T00:00:00.000Z',
      capabilities: ['workspace.read', 'workspace.read'],
      identity,
      installationRevision: 1,
      registrationId: '../escape',
      revision: 0,
      schemaVersion: 1,
      state: 'active',
    })).toThrow()
  })
})
