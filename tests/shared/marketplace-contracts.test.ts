import { describe, expect, it } from 'vitest'
import {
  MarketplaceCatalogSnapshotSchema,
  MarketplaceFavoriteCollectionSchema,
  MarketplaceFavoriteSetRequestSchema,
  MarketplacePackageArtifactIdentitySchema,
  MarketplacePackageArtifactDescriptorSchema,
  MarketplacePackageDownloadIntentSchema,
  MarketplaceSignedPackageArtifactSchema,
  marketplacePackageDownloadIntentFromCatalogEntry,
  marketplacePackageArtifactDescriptorFromCatalogEntry,
  serializeMarketplacePackageArtifactDescriptor,
} from '../../src/shared/marketplace-contracts'

describe('marketplace catalog and favorite contracts', () => {
  it('canonicalizes a strict bounded package artifact descriptor', () => {
    const descriptor = MarketplacePackageArtifactDescriptorSchema.parse({
      byteLength: 12_345,
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      schemaVersion: 1,
      sha256: 'a'.repeat(64),
      sourceId: 'official',
      version: '1.0.0',
    })

    expect(serializeMarketplacePackageArtifactDescriptor(descriptor)).toBe(
      'pivot-marketplace-package:v1\n{"byteLength":12345,"kind":"skill","resourceId":"dev.pivot.react-reviewer","schemaVersion":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceId":"official","version":"1.0.0"}',
    )
    expect(Object.isFrozen(descriptor)).toBe(true)
    expect(() => MarketplacePackageArtifactDescriptorSchema.parse({
      ...descriptor,
      executablePath: 'bin/install.exe',
    })).toThrow()
    expect(() => MarketplacePackageArtifactDescriptorSchema.parse({
      ...descriptor,
      byteLength: 0,
    })).toThrow(/byte|greater/i)
    expect(() => MarketplacePackageArtifactDescriptorSchema.parse({
      ...descriptor,
      byteLength: 512 * 1024 * 1024 + 1,
    })).toThrow(/byte|less/i)
  })

  it('keeps package identity and signed artifact envelopes strict and immutable', () => {
    const identity = MarketplacePackageArtifactIdentitySchema.parse({
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      schemaVersion: 1,
      sourceId: 'official',
      version: '1.0.0',
    })
    const signed = MarketplaceSignedPackageArtifactSchema.parse({
      descriptor: {
        byteLength: 12_345,
        ...identity,
        sha256: 'a'.repeat(64),
      },
      signature: {
        algorithm: 'ed25519',
        keyId: 'pivot-official-2026',
        value: Buffer.alloc(64, 1).toString('base64'),
      },
    })

    expect(Object.isFrozen(identity)).toBe(true)
    expect(Object.isFrozen(signed)).toBe(true)
    expect(Object.isFrozen(signed.descriptor)).toBe(true)
    expect(() => MarketplacePackageArtifactIdentitySchema.parse({
      ...identity,
      artifactPath: 'C:/secret/package.zip',
    })).toThrow()
    expect(() => MarketplaceSignedPackageArtifactSchema.parse({
      ...signed,
      privateKeyPem: 'must-not-pass',
    })).toThrow()
  })

  it('accepts a free signed catalog snapshot with exact production evidence', () => {
    const snapshot = MarketplaceCatalogSnapshotSchema.parse(validSnapshot())

    expect(snapshot.source.trust.algorithm).toBe('ed25519')
    expect(snapshot.entries[0]?.package.sha256).toHaveLength(64)
    expect(snapshot.entries[0]?.distribution.free).toBe(true)
    expect(marketplacePackageArtifactDescriptorFromCatalogEntry(snapshot.entries[0])).toEqual({
      byteLength: 12_345,
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      schemaVersion: 1,
      sha256: 'a'.repeat(64),
      sourceId: 'official',
      version: '1.0.0',
    })
  })

  it('projects only strict download intent from a verified Catalog entry', () => {
    const entry = MarketplaceCatalogSnapshotSchema.parse(validSnapshot()).entries[0]!
    const intent = marketplacePackageDownloadIntentFromCatalogEntry(entry)

    expect(MarketplacePackageDownloadIntentSchema.parse(intent)).toEqual({
      descriptor: marketplacePackageArtifactDescriptorFromCatalogEntry(entry),
      downloadUrl: entry.package.downloadUrl,
      schemaVersion: 1,
      signature: entry.package.signature,
    })
    expect(Object.isFrozen(intent)).toBe(true)
    expect(() => MarketplacePackageDownloadIntentSchema.parse({
      ...intent,
      headers: { authorization: 'forbidden' },
    })).toThrow()
    expect(() => MarketplacePackageDownloadIntentSchema.parse({
      ...intent,
      stagingDirectory: 'C:/unsafe',
    })).toThrow()
  })

  it('rejects commerce fields, insecure URLs and unknown catalog data', () => {
    const withPrice = validSnapshot()
    withPrice.entries[0]!.distribution = { free: true, price: 9.99 } as never
    expect(() => MarketplaceCatalogSnapshotSchema.parse(withPrice)).toThrow()

    const insecure = validSnapshot()
    insecure.entries[0]!.package.downloadUrl = 'http://catalog.pivot.invalid/packages/reviewer.zip'
    expect(() => MarketplaceCatalogSnapshotSchema.parse(insecure)).toThrow(/HTTPS/i)

    expect(() => MarketplaceCatalogSnapshotSchema.parse({
      ...validSnapshot(),
      apiKey: 'must-never-enter-a-catalog',
    })).toThrow()
  })

  it('rejects duplicate resources, mismatched sources and untrusted signatures', () => {
    const duplicate = validSnapshot()
    duplicate.entries.push(structuredClone(duplicate.entries[0]!))
    expect(() => MarketplaceCatalogSnapshotSchema.parse(duplicate)).toThrow(/unique/i)

    const wrongSource = validSnapshot()
    wrongSource.entries[0]!.sourceId = 'community'
    expect(() => MarketplaceCatalogSnapshotSchema.parse(wrongSource)).toThrow(/source/i)

    const wrongKey = validSnapshot()
    wrongKey.entries[0]!.package.signature.keyId = 'unknown-key'
    expect(() => MarketplaceCatalogSnapshotSchema.parse(wrongKey)).toThrow(/key/i)
  })

  it('requires bounded fresh snapshots and valid SHA-256/signature evidence', () => {
    const expiredAtGeneration = validSnapshot()
    expiredAtGeneration.expiresAt = expiredAtGeneration.generatedAt
    expect(() => MarketplaceCatalogSnapshotSchema.parse(expiredAtGeneration)).toThrow(/expiry/i)

    const badHash = validSnapshot()
    badHash.entries[0]!.package.sha256 = 'not-a-hash'
    expect(() => MarketplaceCatalogSnapshotSchema.parse(badHash)).toThrow(/SHA-256/i)

    const badSignature = validSnapshot()
    badSignature.signature.value = 'not-base64!'
    expect(() => MarketplaceCatalogSnapshotSchema.parse(badSignature)).toThrow(/signature/i)

    const wrongSignatureLength = validSnapshot()
    wrongSignatureLength.signature.value = Buffer.alloc(63).toString('base64')
    expect(() => MarketplaceCatalogSnapshotSchema.parse(wrongSignatureLength)).toThrow(/64-byte/i)

    const excessiveLifetime = validSnapshot()
    excessiveLifetime.expiresAt = '2026-09-11T00:00:00.000Z'
    expect(() => MarketplaceCatalogSnapshotSchema.parse(excessiveLifetime)).toThrow(/7 days/i)
  })

  it('validates optimistic favorite writes and rejects duplicate persisted keys', () => {
    expect(MarketplaceFavoriteSetRequestSchema.parse({
      expectedRevision: 2,
      favorite: true,
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      sourceId: 'official',
    }).expectedRevision).toBe(2)

    const item = {
      createdAt: '2026-08-11T00:00:00.000Z',
      kind: 'skill' as const,
      resourceId: 'dev.pivot.react-reviewer',
      sourceId: 'official',
    }
    expect(() => MarketplaceFavoriteCollectionSchema.parse({
      items: [item, item],
      revision: 1,
      schemaVersion: 1,
      updatedAt: '2026-08-11T00:00:00.000Z',
    })).toThrow(/unique/i)

    const collection = MarketplaceFavoriteCollectionSchema.parse({
      items: [item],
      revision: 1,
      schemaVersion: 1,
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
    expect(Object.isFrozen(collection)).toBe(true)
    expect(Object.isFrozen(collection.items)).toBe(true)
    expect(Object.isFrozen(collection.items[0])).toBe(true)
  })
})

function validSnapshot() {
  return {
    entries: [{
      compatibility: { minPivotVersion: '1.5.0-beta' },
      description: 'Reviews React changes without execution authority.',
      distribution: { free: true as const },
      kind: 'skill' as const,
      manifestUrl: 'https://catalog.pivot.invalid/manifests/react-reviewer.json',
      name: 'React Code Reviewer',
      package: {
        byteLength: 12_345,
        downloadUrl: 'https://catalog.pivot.invalid/packages/react-reviewer.zip',
        sha256: 'a'.repeat(64),
        signature: {
          algorithm: 'ed25519' as const,
          keyId: 'pivot-official-2026',
          value: Buffer.alloc(64, 1).toString('base64'),
        },
      },
      publisher: {
        id: 'dev.pivot',
        name: 'Pivot',
        url: 'https://pivot.invalid',
      },
      resourceId: 'dev.pivot.react-reviewer',
      schemaVersion: 1 as const,
      sourceId: 'official',
      tags: ['review', 'react'],
      updatedAt: '2026-08-11T00:00:00.000Z',
      version: '1.0.0',
    }],
    expiresAt: '2026-08-12T00:00:00.000Z',
    generatedAt: '2026-08-11T00:00:00.000Z',
    revision: 1,
    schemaVersion: 1 as const,
    signature: {
      algorithm: 'ed25519' as const,
      keyId: 'pivot-official-2026',
      value: Buffer.alloc(64, 2).toString('base64'),
    },
    source: {
      catalogUrl: 'https://catalog.pivot.invalid/catalog.json',
      displayName: 'Pivot Official',
      id: 'official',
      schemaVersion: 1 as const,
      trust: { algorithm: 'ed25519' as const, keyId: 'pivot-official-2026' },
    },
  }
}
