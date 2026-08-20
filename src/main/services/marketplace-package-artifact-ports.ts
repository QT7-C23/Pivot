import type {
  MarketplacePackageArtifactDescriptor,
  MarketplaceSignature,
} from '../../shared/marketplace-contracts'

export interface MarketplacePackageArtifactInspectionRequest {
  readonly artifactPath: string
  readonly maxByteLength: number
}

export interface MarketplacePackageArtifactInspection {
  readonly byteLength: number
  readonly sha256: string
}

export interface MarketplacePackageArtifactInspectionPort {
  inspect(request: MarketplacePackageArtifactInspectionRequest): Promise<MarketplacePackageArtifactInspection>
}

export interface MarketplacePackageArtifactVerificationRequest {
  readonly artifactPath: string
  readonly descriptor: MarketplacePackageArtifactDescriptor
  readonly signature: MarketplaceSignature
}

export interface MarketplacePackageArtifactVerificationEvidence {
  readonly artifactPath: string
  readonly descriptor: MarketplacePackageArtifactDescriptor
  readonly signatureKeyId: string
  readonly status: 'verified'
  readonly verifiedAt: string
}

export interface MarketplacePackageArtifactVerificationPort {
  verify(
    request: MarketplacePackageArtifactVerificationRequest,
  ): Promise<MarketplacePackageArtifactVerificationEvidence>
}
