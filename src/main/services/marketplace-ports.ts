import type {
  MarketplaceCatalogSnapshot,
  MarketplaceFavoriteCollection,
  MarketplaceFavoriteSetRequest,
} from '../../shared/marketplace-contracts'

export interface MarketplaceCatalogReaderPort {
  readSnapshot(): Promise<MarketplaceCatalogSnapshot>
}

export interface MarketplaceFavoriteReaderPort {
  getFavorites(): MarketplaceFavoriteCollection
}

export interface MarketplaceFavoriteWriterPort {
  setFavorite(request: MarketplaceFavoriteSetRequest): MarketplaceFavoriteCollection
}
