import type { MarketplacePackageManifest } from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplaceExtractedPackagePort } from './marketplace-package-archive-ports'

export interface MarketplacePackageManifestInspectionRequest {
  readonly rootPath: string
}

export interface MarketplacePackageManifestInspection {
  readonly byteLength: number
  readonly sha256: string
  readonly value: unknown
}

export interface MarketplacePackageManifestInspectionPort {
  inspect(request: MarketplacePackageManifestInspectionRequest): Promise<MarketplacePackageManifestInspection>
}

export interface MarketplaceVerifiedPackageManifest {
  readonly manifest: MarketplacePackageManifest
  readonly manifestEvidence: {
    readonly byteLength: number
    readonly path: 'pivot-package.json'
    readonly sha256: string
  }
}

export interface MarketplacePackageManifestReaderPort {
  read(extracted: MarketplaceExtractedPackagePort): Promise<MarketplaceVerifiedPackageManifest>
}
