import {
  MARKETPLACE_PACKAGE_MANIFEST_PATH,
  MarketplacePackageManifestSchema,
} from '../../shared/marketplace-package-manifest-contracts'
import { MarketplaceExtractedPackageEvidenceSchema } from '../../shared/marketplace-archive-contracts'
import type { MarketplaceExtractedPackagePort } from './marketplace-package-archive-ports'
import type {
  MarketplacePackageManifestInspectionPort,
  MarketplacePackageManifestReaderPort,
  MarketplaceVerifiedPackageManifest,
} from './marketplace-package-manifest-ports'

export class VerifiedMarketplacePackageManifestAdapter {
  private readonly inspection: MarketplacePackageManifestInspectionPort

  constructor(options: { readonly inspection: MarketplacePackageManifestInspectionPort }) {
    this.inspection = options.inspection
  }

  openReaderPort(): MarketplacePackageManifestReaderPort {
    return Object.freeze({ read: (extracted: MarketplaceExtractedPackagePort) => this.read(extracted) })
  }

  private async read(extracted: MarketplaceExtractedPackagePort): Promise<MarketplaceVerifiedPackageManifest> {
    if (!extracted || typeof extracted.rootPath !== 'string' || typeof extracted.discard !== 'function') {
      throw new Error('Marketplace package manifest requires an extracted package capability')
    }
    const evidence = MarketplaceExtractedPackageEvidenceSchema.parse(extracted.evidence)
    const expected = evidence.files.find((file) => file.path === MARKETPLACE_PACKAGE_MANIFEST_PATH)
    if (!expected) throw new Error('Marketplace package archive does not contain pivot-package.json')
    const inspected = await this.inspection.inspect({ rootPath: extracted.rootPath })
    if (inspected.byteLength !== expected.byteLength || inspected.sha256 !== expected.sha256) {
      throw new Error('Marketplace package manifest digest does not match extraction evidence')
    }
    return Object.freeze({
      manifest: MarketplacePackageManifestSchema.parse(inspected.value),
      manifestEvidence: Object.freeze({
        byteLength: inspected.byteLength,
        path: MARKETPLACE_PACKAGE_MANIFEST_PATH,
        sha256: inspected.sha256,
      }),
    })
  }
}
