import type { MarketplaceCatalogSnapshot } from '../../shared/marketplace-contracts'

export interface MarketplaceTrustedCatalogSource {
  readonly catalogUrl: string
  readonly id: string
  readonly keyId: string
}

export interface MarketplaceCatalogSignatureVerificationRequest {
  readonly keyId: string
  readonly payload: string
  readonly signature: string
  readonly sourceId: string
}

export interface MarketplaceCatalogTransportPort {
  fetchJson(url: string): Promise<unknown>
}

export interface MarketplaceCatalogTrustReaderPort {
  getSource(sourceId: string): MarketplaceTrustedCatalogSource | null
  verify(request: MarketplaceCatalogSignatureVerificationRequest): boolean
}

export interface MarketplaceCatalogCacheReaderPort {
  read(sourceId: string): MarketplaceCatalogSnapshot | null
}

export interface MarketplaceCatalogCacheWriterPort {
  write(snapshot: MarketplaceCatalogSnapshot): void
}

export interface MarketplaceCatalogCachePort
extends MarketplaceCatalogCacheReaderPort, MarketplaceCatalogCacheWriterPort {}
