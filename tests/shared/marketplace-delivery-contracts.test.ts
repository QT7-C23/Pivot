import { describe, expect, it } from 'vitest'
import {
  MarketplaceInstallRequestSchema,
  MarketplaceInstallResultSchema,
} from '../../src/shared/marketplace-delivery-contracts'

describe('Marketplace delivery IPC contracts', () => {
  it('accepts only catalog identity, revision and explicit capability approvals', () => {
    expect(MarketplaceInstallRequestSchema.parse({
      approvedCapabilities: ['workspace.read'],
      expectedCatalogRevision: 4,
      kind: 'skill',
      resourceId: 'dev.pivot.skill',
      sourceId: 'official',
    })).toMatchObject({ expectedCatalogRevision: 4 })
    expect(() => MarketplaceInstallRequestSchema.parse({
      approvedCapabilities: [], downloadUrl: 'https://attacker.invalid/package.zip',
      expectedCatalogRevision: 4, kind: 'skill', resourceId: 'dev.pivot.skill', sourceId: 'official',
    })).toThrow()
  })

  it('never permits a Main filesystem path or storage key in public installation state', () => {
    expect(() => MarketplaceInstallResultSchema.parse({
      installation: {
        capabilities: [], identity: identity(), revision: 1, rootPath: 'D:/secret', state: 'installed',
      },
      status: 'installed',
    })).toThrow()
  })
})

function identity() {
  return { kind: 'theme' as const, resourceId: 'dev.pivot.theme', schemaVersion: 1 as const, sourceId: 'official', version: '1.0.0' }
}
