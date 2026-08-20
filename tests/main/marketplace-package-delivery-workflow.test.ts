import { describe, expect, it } from 'vitest'
import { MarketplacePackageDeliveryWorkflow } from '../../src/main/services/marketplace-package-delivery-workflow'

describe('Marketplace package delivery workflow', () => {
  it('resolves package authority from the verified catalog and requires exact capabilities before install', async () => {
    const fixture = createFixture()
    const pending = await fixture.workflow.install({
      approvedCapabilities: [], expectedCatalogRevision: 7,
      kind: 'skill', resourceId: 'dev.pivot.skill', sourceId: 'official',
    })
    expect(pending).toMatchObject({ declaredCapabilities: ['workspace.read'], status: 'requires-approval' })
    expect(fixture.installs).toBe(0)
    expect(fixture.cleanup).toEqual(['extracted', 'staged'])

    fixture.cleanup.length = 0
    const installed = await fixture.workflow.install({
      approvedCapabilities: ['workspace.read'], expectedCatalogRevision: 7,
      kind: 'skill', resourceId: 'dev.pivot.skill', sourceId: 'official',
    })
    expect(installed).toMatchObject({ status: 'installed', installation: { revision: 1, state: 'installed' } })
    expect(fixture.installs).toBe(1)
    expect(fixture.cleanup).toEqual(['extracted', 'staged'])
  })

  it('rejects stale catalog revision and unknown identity before network activity', async () => {
    const fixture = createFixture()
    await expect(fixture.workflow.install({ approvedCapabilities: [], expectedCatalogRevision: 6, kind: 'skill', resourceId: 'dev.pivot.skill', sourceId: 'official' }))
      .rejects.toThrow(/catalog revision|stale/i)
    await expect(fixture.workflow.install({ approvedCapabilities: [], expectedCatalogRevision: 7, kind: 'skill', resourceId: 'unknown', sourceId: 'official' }))
      .rejects.toThrow(/catalog resource|not found/i)
    expect(fixture.downloads).toBe(0)
  })

  it('discards staged and extracted capabilities after a real install failure', async () => {
    const fixture = createFixture({ installFailure: true })
    await expect(fixture.workflow.install({ approvedCapabilities: ['workspace.read'], expectedCatalogRevision: 7, kind: 'skill', resourceId: 'dev.pivot.skill', sourceId: 'official' }))
      .rejects.toThrow(/install failure/i)
    expect(fixture.cleanup).toEqual(['extracted', 'staged'])
  })
})

function createFixture(options: { installFailure?: boolean } = {}) {
  const cleanup: string[] = []
  let downloads = 0
  let installs = 0
  const identity = { kind: 'skill' as const, resourceId: 'dev.pivot.skill', schemaVersion: 1 as const, sourceId: 'official', version: '1.0.0' }
  const entry = {
    compatibility: { minPivotVersion: '2.0.0' }, description: 'Skill', distribution: { free: true as const },
    kind: 'skill' as const, manifestUrl: 'https://example.com/manifest.json', name: 'Skill',
    package: { byteLength: 10, downloadUrl: 'https://example.com/package.zip', sha256: 'a'.repeat(64), signature: { algorithm: 'ed25519' as const, keyId: 'key', value: `${'A'.repeat(86)}==` } },
    publisher: { id: 'pivot-labs', name: 'Pivot Labs' }, resourceId: identity.resourceId, schemaVersion: 1 as const,
    sourceId: 'official', tags: [], updatedAt: '2026-08-20T00:00:00.000Z', version: identity.version,
  }
  const extracted = { discard: async () => { cleanup.push('extracted') }, evidence: { files: [], inventory: { entries: [], schemaVersion: 1, totalCompressedBytes: 0, totalUncompressedBytes: 0 }, schemaVersion: 1, totalBytes: 0 }, rootPath: 'D:/extracted' }
  const bound = { discard: extracted.discard, extractionEvidence: extracted.evidence, manifest: { capabilities: ['workspace.read'], entrypoint: 'SKILL.md', files: [], identity, publisherId: 'pivot-labs', schemaVersion: 1 }, rootPath: extracted.rootPath }
  const workflow = new MarketplacePackageDeliveryWorkflow({
    archive: { prepare: async () => extracted as never },
    binding: { bind: () => bound as never },
    catalog: { readSnapshot: async () => ({ entries: [entry], revision: 7 }) as never },
    download: { downloadAndVerify: async () => { downloads += 1; return { artifactPath: 'D:/staged', discard: async () => { cleanup.push('staged') }, evidence: {} } as never } },
    installation: { install: async () => { installs += 1; if (options.installFailure) throw new Error('injected install failure'); return { capabilities: ['workspace.read'], createdAt: '2026-08-20T00:00:00.000Z', identity, revision: 1, schemaVersion: 1, state: 'installed', storageKey: 'a'.repeat(64), updatedAt: '2026-08-20T00:00:00.000Z' } } },
    manifests: { read: async () => ({ manifest: bound.manifest, manifestEvidence: {} }) as never },
    reviews: { review: (_package, approvals) => ({ approvedCapabilities: approvals, declaredCapabilities: ['workspace.read'], identity, reviewedAt: '2026-08-20T00:00:00.000Z', riskLevel: 'low', schemaVersion: 1, status: approvals.length === 1 ? 'approved' : 'requires-approval' }) as never },
  })
  return { cleanup, get downloads() { return downloads }, get installs() { return installs }, workflow }
}
