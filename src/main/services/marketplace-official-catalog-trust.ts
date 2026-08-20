import { createHash, createPublicKey } from 'node:crypto'
import { MarketplaceCatalogSourceSchema } from '../../shared/marketplace-contracts'
import type { MarketplaceTrustedCatalogConfig } from './marketplace-catalog-trust-registry'

const OFFICIAL_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1+PTlOomL8YLqPSvWFhpgW7bLobYxzWUO8P8TWydFKg=
-----END PUBLIC KEY-----
`

export const OFFICIAL_MARKETPLACE_CATALOG_PUBLIC_KEY_FINGERPRINT =
  'ea8676fe3125f41e659992541ceaecfca381b76d2b8b8536a4ad7a37e7cd75b6'

const OFFICIAL_SOURCE = MarketplaceCatalogSourceSchema.parse({
  catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
  displayName: 'Pivot Marketplace',
  id: 'pivot-official',
  schemaVersion: 1,
  trust: {
    algorithm: 'ed25519',
    keyId: 'pivot-marketplace-2026-01',
  },
})

const OFFICIAL_CONFIG: MarketplaceTrustedCatalogConfig = Object.freeze({
  publicKeyPem: OFFICIAL_PUBLIC_KEY_PEM,
  source: OFFICIAL_SOURCE,
})

assertOfficialPublicKey()

export function getOfficialMarketplaceCatalogTrustConfig(): MarketplaceTrustedCatalogConfig {
  return OFFICIAL_CONFIG
}

function assertOfficialPublicKey(): void {
  const key = createPublicKey(OFFICIAL_PUBLIC_KEY_PEM)
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Official Marketplace Catalog trust root must be an Ed25519 public key')
  }
  const fingerprint = createHash('sha256')
    .update(key.export({ format: 'der', type: 'spki' }))
    .digest('hex')
  if (fingerprint !== OFFICIAL_MARKETPLACE_CATALOG_PUBLIC_KEY_FINGERPRINT) {
    throw new Error('Official Marketplace Catalog public-key fingerprint mismatch')
  }
}
