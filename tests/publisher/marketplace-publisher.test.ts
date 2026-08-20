import { describe, expect, it } from 'vitest'
import { MarketplaceCatalogTrustRegistry } from '../../src/main/services/marketplace-catalog-trust-registry'
import { NodeMarketplacePublisherCryptoAdapter } from '../../src/publisher/node-marketplace-publisher-crypto-adapter'
import { MarketplacePublisher } from '../../src/publisher/marketplace-publisher'
import {
  MarketplaceCatalogPayloadSchema,
  serializeMarketplaceCatalogPayload,
} from '../../src/shared/marketplace-contracts'

const NOW = '2026-08-17T04:00:00.000Z'

describe('Marketplace publisher', () => {
  it('generates a self-consistent Ed25519 keyset without weakening private-key separation', () => {
    const publisher = createPublisher()

    const keyset = publisher.createKeyset({ keyId: 'pivot-marketplace-2026-01' })

    expect(keyset.manifest).toMatchObject({
      algorithm: 'ed25519',
      createdAt: NOW,
      keyId: 'pivot-marketplace-2026-01',
      schemaVersion: 1,
    })
    expect(keyset.manifest.publicKeyFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(keyset.manifest.publicKeyPem).toContain('BEGIN PUBLIC KEY')
    expect(keyset.privateKeyPem).toContain('BEGIN PRIVATE KEY')
    expect(JSON.stringify(keyset.manifest)).not.toContain('PRIVATE KEY')
  })

  it('signs the exact shared canonical payload and verifies through the production trust reader', () => {
    const publisher = createPublisher()
    const keyset = publisher.createKeyset({ keyId: 'pivot-marketplace-2026-01' })

    const snapshot = publisher.signCatalog({
      draft: draft(),
      keyset,
      lifetimeHours: 144,
    })

    expect(snapshot).toMatchObject({
      entries: [],
      expiresAt: '2026-08-23T04:00:00.000Z',
      generatedAt: NOW,
      revision: 0,
      schemaVersion: 1,
      signature: {
        algorithm: 'ed25519',
        keyId: 'pivot-marketplace-2026-01',
      },
    })
    const payload = MarketplaceCatalogPayloadSchema.parse({
      entries: snapshot.entries,
      expiresAt: snapshot.expiresAt,
      generatedAt: snapshot.generatedAt,
      revision: snapshot.revision,
      schemaVersion: snapshot.schemaVersion,
      source: snapshot.source,
    })
    const trust = new MarketplaceCatalogTrustRegistry([{
      publicKeyPem: keyset.manifest.publicKeyPem,
      source: snapshot.source,
    }]).openReaderPort()
    expect(trust.verify({
      keyId: snapshot.signature.keyId,
      payload: serializeMarketplaceCatalogPayload(payload),
      signature: snapshot.signature.value,
      sourceId: snapshot.source.id,
    })).toBe(true)
    expect(trust.verify({
      keyId: snapshot.signature.keyId,
      payload: serializeMarketplaceCatalogPayload({ ...payload, revision: 1 }),
      signature: snapshot.signature.value,
      sourceId: snapshot.source.id,
    })).toBe(false)
  })

  it('rejects unknown draft fields, unsafe lifetimes and a mismatched private key', () => {
    const publisher = createPublisher()
    const keyset = publisher.createKeyset({ keyId: 'pivot-marketplace-2026-01' })
    const other = publisher.createKeyset({ keyId: 'pivot-marketplace-2026-01' })

    expect(() => publisher.signCatalog({
      draft: { ...draft(), apiKey: 'must-not-pass' },
      keyset,
    })).toThrow()
    expect(() => publisher.signCatalog({ draft: draft(), keyset, lifetimeHours: 169 }))
      .toThrow(/lifetime/i)
    expect(() => publisher.signCatalog({
      draft: draft(),
      keyset: { ...keyset, privateKeyPem: other.privateKeyPem },
    })).toThrow(/keyset/i)
  })
})

function createPublisher(): MarketplacePublisher {
  return new MarketplacePublisher({
    clock: () => new Date(NOW),
    crypto: new NodeMarketplacePublisherCryptoAdapter(),
  })
}

function draft() {
  return {
    entries: [],
    revision: 0,
    schemaVersion: 1 as const,
    source: {
      catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
      displayName: 'Pivot Marketplace',
      id: 'pivot-official',
      schemaVersion: 1 as const,
      trust: {
        algorithm: 'ed25519' as const,
        keyId: 'pivot-marketplace-2026-01',
      },
    },
  }
}
