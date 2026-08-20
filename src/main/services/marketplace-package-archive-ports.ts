import type {
  MarketplaceArchiveInventory,
  MarketplaceExtractedPackageEvidence,
} from '../../shared/marketplace-archive-contracts'
import type {
  MarketplaceStagedArtifactReadLeasePort,
  MarketplaceVerifiedStagedArtifactPort,
} from './marketplace-package-download-ports'

export interface MarketplaceArchiveInspectionRequest {
  readonly source: MarketplaceStagedArtifactReadLeasePort
}

export interface MarketplaceArchiveInspectionPort {
  inspect(request: MarketplaceArchiveInspectionRequest): Promise<MarketplaceArchiveInventory>
}

export interface MarketplaceArchiveExtractionRequest {
  readonly expectedInventory: MarketplaceArchiveInventory
  readonly signal?: AbortSignal
  readonly source: MarketplaceStagedArtifactReadLeasePort
}

export interface MarketplaceExtractedPackagePort {
  discard(): Promise<void>
  readonly evidence: MarketplaceExtractedPackageEvidence
  readonly rootPath: string
}

export interface MarketplaceArchiveExtractionPort {
  extract(request: MarketplaceArchiveExtractionRequest): Promise<MarketplaceExtractedPackagePort>
}

export interface MarketplacePackageArchivePreparationPort {
  prepare(
    source: MarketplaceVerifiedStagedArtifactPort,
    signal?: AbortSignal,
  ): Promise<MarketplaceExtractedPackagePort>
}
