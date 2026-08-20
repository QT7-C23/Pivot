import { describe, expect, it } from 'vitest'
import { MarketplaceCapabilityReviewAdapter } from '../../src/main/services/marketplace-capability-review-adapter'
import type { MarketplaceBoundPackagePort } from '../../src/main/services/marketplace-package-binding-ports'
import type { MarketplaceCapability } from '../../src/shared/marketplace-package-manifest-contracts'

describe('Marketplace capability review adapter', () => {
  const reviewer = new MarketplaceCapabilityReviewAdapter({
    clock: () => new Date('2026-08-20T00:00:00.000Z'),
  }).openReviewPort()

  it('auto-approves capability-free packages and requires explicit approval otherwise', () => {
    expect(reviewer.review(bound('prompt', []), []).status).toBe('approved')
    const pending = reviewer.review(bound('plugin', ['network.fetch', 'workspace.write']), [])
    expect(pending).toMatchObject({
      approvedCapabilities: [], riskLevel: 'high', status: 'requires-approval',
    })
    expect(reviewer.review(
      bound('plugin', ['network.fetch', 'workspace.write']),
      ['network.fetch', 'workspace.write'],
    ).status).toBe('approved')
  })

  it('rejects capabilities forbidden for a resource kind and globally dangerous capabilities', () => {
    expect(reviewer.review(bound('theme', ['network.fetch']), []).status).toBe('rejected')
    expect(reviewer.review(bound('skill', ['workspace.write']), []).status).toBe('rejected')
    expect(reviewer.review(bound('plugin', ['process.spawn']), ['process.spawn']))
      .toMatchObject({ riskLevel: 'critical', status: 'rejected' })
    expect(reviewer.review(bound('plugin', ['secrets.read']), ['secrets.read']).status).toBe('rejected')
  })

  it('rejects duplicate, unknown or undeclared approvals instead of widening authority', () => {
    const plugin = bound('plugin', ['workspace.read'])
    expect(() => reviewer.review(plugin, ['workspace.read', 'workspace.read'])).toThrow(/unique|duplicate/i)
    expect(() => reviewer.review(plugin, ['network.fetch'])).toThrow(/declared|approval/i)
    expect(() => reviewer.review(plugin, ['shell.root' as MarketplaceCapability])).toThrow()
  })
})

function bound(
  kind: 'plugin' | 'prompt' | 'skill' | 'theme',
  capabilities: readonly MarketplaceCapability[],
): MarketplaceBoundPackagePort {
  return {
    artifactEvidence: {
      artifactPath: 'C:\\staged\\package.pivot',
      descriptor: {
        byteLength: 1, kind, resourceId: 'dev.pivot.example', schemaVersion: 1,
        sha256: 'a'.repeat(64), sourceId: 'official', version: '1.0.0',
      },
      signatureKeyId: 'official-key', status: 'verified', verifiedAt: '2026-08-20T00:00:00.000Z',
    },
    discard: async () => undefined,
    extractionEvidence: {
      files: [], inventory: {
        entries: [], schemaVersion: 1, totalCompressedBytes: 0, totalUncompressedBytes: 0,
      }, schemaVersion: 1, totalBytes: 0,
    },
    manifest: {
      capabilities, entrypoint: 'index.js',
      files: [{ byteLength: 0, path: 'index.js', sha256: 'b'.repeat(64) }],
      identity: {
        kind, resourceId: 'dev.pivot.example', schemaVersion: 1, sourceId: 'official', version: '1.0.0',
      },
      publisherId: 'pivot-labs', schemaVersion: 1,
    },
    rootPath: 'C:\\extracted',
  }
}
