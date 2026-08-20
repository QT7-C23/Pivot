import type { MarketplacePackageDownloadIntent } from '../../shared/marketplace-contracts'
import type {
  MarketplacePackageArtifactVerificationEvidence,
} from './marketplace-package-artifact-ports'

export interface MarketplacePackageStagingRequest {
  readonly downloadUrl: string
  readonly expectedByteLength: number
  readonly signal?: AbortSignal
}

export interface MarketplaceStagedArtifactPort {
  acquireReadLease(): Promise<MarketplaceStagedArtifactReadLeasePort>
  readonly artifactPath: string
  discard(): Promise<void>
}

export interface MarketplaceStagedArtifactReadLeasePort {
  readonly artifactPath: string
  readonly fileDescriptor: number
  release(): Promise<void>
}

export interface MarketplacePackageStagingPort {
  stage(request: MarketplacePackageStagingRequest): Promise<MarketplaceStagedArtifactPort>
}

export interface MarketplaceVerifiedStagedArtifactPort {
  acquireReadLease(): Promise<MarketplaceStagedArtifactReadLeasePort>
  readonly artifactPath: string
  readonly evidence: MarketplacePackageArtifactVerificationEvidence
  discard(): Promise<void>
}

export interface MarketplacePackageDownloadPort {
  downloadAndVerify(
    intent: MarketplacePackageDownloadIntent,
    signal?: AbortSignal,
  ): Promise<MarketplaceVerifiedStagedArtifactPort>
}
