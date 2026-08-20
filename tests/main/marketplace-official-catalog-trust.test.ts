import { createHash } from 'node:crypto'
import { createPublicKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_MARKETPLACE_CATALOG_PUBLIC_KEY_FINGERPRINT,
  getOfficialMarketplaceCatalogTrustConfig,
} from '../../src/main/services/marketplace-official-catalog-trust'
import { MarketplaceCatalogTrustRegistry } from '../../src/main/services/marketplace-catalog-trust-registry'
import { serializeMarketplaceCatalogPayload } from '../../src/shared/marketplace-contracts'

const QUALIFICATION_PAYLOAD = serializeMarketplaceCatalogPayload({
  entries: [],
  expiresAt: '2026-08-23T21:25:56.764Z',
  generatedAt: '2026-08-16T21:25:56.764Z',
  revision: 0,
  schemaVersion: 1,
  source: {
    catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
    displayName: 'Pivot Marketplace',
    id: 'pivot-official',
    schemaVersion: 1,
    trust: {
      algorithm: 'ed25519',
      keyId: 'pivot-marketplace-2026-01',
    },
  },
})
const QUALIFICATION_SIGNATURE = 'wzqJAIdTq+Rq/jeHQSzkqIQ+YBztT+BwCNxs+OL7+iVBerFpEmWq5ollHFu9fsb0o5cJq0WU1FDcVvlfrljABw=='

describe('official Marketplace Catalog trust root', () => {
  it('pins the generated public Ed25519 identity and official source in Main', () => {
    const config = getOfficialMarketplaceCatalogTrustConfig()
    const publicKey = createPublicKey(config.publicKeyPem)
    const fingerprint = createHash('sha256')
      .update(publicKey.export({ format: 'der', type: 'spki' }))
      .digest('hex')

    expect(publicKey.asymmetricKeyType).toBe('ed25519')
    expect(fingerprint).toBe('ea8676fe3125f41e659992541ceaecfca381b76d2b8b8536a4ad7a37e7cd75b6')
    expect(fingerprint).toBe(OFFICIAL_MARKETPLACE_CATALOG_PUBLIC_KEY_FINGERPRINT)
    expect(config.source).toEqual({
      catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
      displayName: 'Pivot Marketplace',
      id: 'pivot-official',
      schemaVersion: 1,
      trust: {
        algorithm: 'ed25519',
        keyId: 'pivot-marketplace-2026-01',
      },
    })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.source)).toBe(true)
  })

  it('accepts an official qualification signature and rejects tampering or another key id', () => {
    const trust = new MarketplaceCatalogTrustRegistry([
      getOfficialMarketplaceCatalogTrustConfig(),
    ]).openReaderPort()

    expect(trust.verify({
      keyId: 'pivot-marketplace-2026-01',
      payload: QUALIFICATION_PAYLOAD,
      signature: QUALIFICATION_SIGNATURE,
      sourceId: 'pivot-official',
    })).toBe(true)
    expect(trust.verify({
      keyId: 'pivot-marketplace-2026-01',
      payload: `${QUALIFICATION_PAYLOAD}.`,
      signature: QUALIFICATION_SIGNATURE,
      sourceId: 'pivot-official',
    })).toBe(false)
    expect(trust.verify({
      keyId: 'pivot-marketplace-rotated',
      payload: QUALIFICATION_PAYLOAD,
      signature: QUALIFICATION_SIGNATURE,
      sourceId: 'pivot-official',
    })).toBe(false)
  })
})
