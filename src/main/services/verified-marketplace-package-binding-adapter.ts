import { MarketplaceExtractedPackageEvidenceSchema } from '../../shared/marketplace-archive-contracts'
import {
  MarketplaceCatalogEntrySchema,
  MarketplacePackageArtifactDescriptorSchema,
  marketplacePackageArtifactDescriptorFromCatalogEntry,
} from '../../shared/marketplace-contracts'
import {
  MARKETPLACE_PACKAGE_MANIFEST_PATH,
  MarketplacePackageManifestSchema,
} from '../../shared/marketplace-package-manifest-contracts'
import type {
  MarketplaceBoundPackagePort,
  MarketplaceExtractedRootValidationPort,
  MarketplacePackageBindingPort,
  MarketplacePackageBindingRequest,
} from './marketplace-package-binding-ports'

export class VerifiedMarketplacePackageBindingAdapter {
  private readonly rootValidation: MarketplaceExtractedRootValidationPort

  constructor(options: { readonly rootValidation: MarketplaceExtractedRootValidationPort }) {
    this.rootValidation = options.rootValidation
  }

  openBindingPort(): MarketplacePackageBindingPort {
    return Object.freeze({ bind: (request: MarketplacePackageBindingRequest) => this.bind(request) })
  }

  private bind(request: MarketplacePackageBindingRequest): MarketplaceBoundPackagePort {
    if (!request || typeof request !== 'object') throw new Error('Marketplace package binding request is invalid')
    const catalogEntry = MarketplaceCatalogEntrySchema.parse(request.catalogEntry)
    const descriptor = MarketplacePackageArtifactDescriptorSchema.parse(request.artifactEvidence?.descriptor)
    const expectedDescriptor = marketplacePackageArtifactDescriptorFromCatalogEntry(catalogEntry)
    if (JSON.stringify(descriptor) !== JSON.stringify(expectedDescriptor)) {
      throw new Error('Marketplace signed descriptor does not match the Catalog entry')
    }
    if (request.artifactEvidence?.status !== 'verified'
      || request.artifactEvidence.signatureKeyId !== catalogEntry.package.signature.keyId) {
      throw new Error('Marketplace artifact verification signature does not match the Catalog entry')
    }
    if (!request.extracted || typeof request.extracted.discard !== 'function'
      || typeof request.extracted.rootPath !== 'string') {
      throw new Error('Marketplace package binding requires an extracted package capability')
    }
    this.rootValidation.validate(request.extracted.rootPath)
    const extractionEvidence = MarketplaceExtractedPackageEvidenceSchema.parse(request.extracted.evidence)
    const manifest = MarketplacePackageManifestSchema.parse(request.verifiedManifest?.manifest)
    const expectedIdentity = {
      kind: descriptor.kind,
      resourceId: descriptor.resourceId,
      schemaVersion: 1,
      sourceId: descriptor.sourceId,
      version: descriptor.version,
    }
    if (JSON.stringify(manifest.identity) !== JSON.stringify(expectedIdentity)) {
      throw new Error('Marketplace package manifest identity does not match the signed descriptor')
    }
    if (manifest.publisherId !== catalogEntry.publisher.id) {
      throw new Error('Marketplace package manifest publisher does not match the Catalog entry')
    }
    const manifestFile = extractionEvidence.files.find((file) => file.path === MARKETPLACE_PACKAGE_MANIFEST_PATH)
    if (!manifestFile || JSON.stringify(manifestFile) !== JSON.stringify(request.verifiedManifest.manifestEvidence)) {
      throw new Error('Marketplace package manifest evidence does not match extracted content')
    }
    const payloadFiles = extractionEvidence.files.filter((file) => file.path !== MARKETPLACE_PACKAGE_MANIFEST_PATH)
    if (JSON.stringify(payloadFiles) !== JSON.stringify(manifest.files)) {
      throw new Error('Marketplace extracted payload files do not match the package manifest')
    }
    return Object.freeze({
      artifactEvidence: Object.freeze({
        artifactPath: request.artifactEvidence.artifactPath,
        descriptor,
        signatureKeyId: request.artifactEvidence.signatureKeyId,
        status: 'verified' as const,
        verifiedAt: request.artifactEvidence.verifiedAt,
      }),
      discard: () => request.extracted.discard(),
      extractionEvidence,
      manifest,
      rootPath: request.extracted.rootPath,
    })
  }
}
