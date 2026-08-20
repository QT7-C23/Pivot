import type { MarketplaceCatalogReaderPort } from './marketplace-ports'
import { BoundedHttpsJsonTransportAdapter } from './bounded-https-json-transport-adapter'
import type { MarketplaceTrustedCatalogConfig } from './marketplace-catalog-trust-registry'
import { MarketplaceCatalogTrustRegistry } from './marketplace-catalog-trust-registry'
import { SqliteMarketplaceCatalogCacheAdapter } from './sqlite-marketplace-catalog-cache-adapter'
import { VerifiedMarketplaceCatalogAdapter } from './verified-marketplace-catalog-adapter'

export interface MarketplaceCatalogRuntime {
  close(): void
  readonly reader: MarketplaceCatalogReaderPort
}

export function createMarketplaceCatalogRuntime(options: {
  clock?: () => Date
  databasePath: string
  fetchImpl?: typeof fetch
  maxBytes?: number
  source: MarketplaceTrustedCatalogConfig | null
  timeoutMs?: number
}): MarketplaceCatalogRuntime | null {
  if (!options.source) return null

  const trust = new MarketplaceCatalogTrustRegistry([options.source])
  const transport = new BoundedHttpsJsonTransportAdapter({
    fetchImpl: options.fetchImpl,
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs,
  })
  const cache = new SqliteMarketplaceCatalogCacheAdapter({
    databasePath: options.databasePath,
  })
  try {
    const verified = new VerifiedMarketplaceCatalogAdapter({
      cache: cache.openPort(),
      clock: options.clock,
      sourceId: options.source.source.id,
      transport: transport.openPort(),
      trust: trust.openReaderPort(),
    })
    return Object.freeze({
      close: () => cache.close(),
      reader: verified.openReaderPort(),
    })
  } catch (error) {
    cache.close()
    throw error
  }
}
