import type { MarketplaceExtractedPackageEvidence } from '../../shared/marketplace-archive-contracts'
import type { MarketplaceCatalogEntry } from '../../shared/marketplace-contracts'
import type { MarketplacePackageManifest } from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplacePackageArtifactVerificationEvidence } from './marketplace-package-artifact-ports'
import type { MarketplaceExtractedPackagePort } from './marketplace-package-archive-ports'
import type { MarketplaceVerifiedPackageManifest } from './marketplace-package-manifest-ports'

export interface MarketplacePackageBindingRequest {
  readonly artifactEvidence: MarketplacePackageArtifactVerificationEvidence
  readonly catalogEntry: MarketplaceCatalogEntry
  readonly extracted: MarketplaceExtractedPackagePort
  readonly verifiedManifest: MarketplaceVerifiedPackageManifest
}

export interface MarketplaceBoundPackagePort {
  readonly artifactEvidence: MarketplacePackageArtifactVerificationEvidence
  discard(): Promise<void>
  readonly extractionEvidence: MarketplaceExtractedPackageEvidence
  readonly manifest: MarketplacePackageManifest
  readonly rootPath: string
}

export interface MarketplacePackageBindingPort {
  bind(request: MarketplacePackageBindingRequest): MarketplaceBoundPackagePort
}

export interface MarketplaceExtractedRootValidationPort {
  validate(rootPath: string): void
}
