import path from 'node:path'
import {
  MAX_MARKETPLACE_PACKAGE_BYTES,
  MarketplacePackageArtifactDescriptorSchema,
  MarketplaceSignatureSchema,
  serializeMarketplacePackageArtifactDescriptor,
} from '../../shared/marketplace-contracts'
import type { MarketplaceCatalogTrustReaderPort } from './marketplace-catalog-ports'
import type {
  MarketplacePackageArtifactInspectionPort,
  MarketplacePackageArtifactVerificationEvidence,
  MarketplacePackageArtifactVerificationPort,
  MarketplacePackageArtifactVerificationRequest,
} from './marketplace-package-artifact-ports'

export interface VerifiedMarketplacePackageArtifactAdapterOptions {
  readonly clock?: () => Date
  readonly inspection: MarketplacePackageArtifactInspectionPort
  readonly maxByteLength?: number
  readonly trust: MarketplaceCatalogTrustReaderPort
}

export class VerifiedMarketplacePackageArtifactAdapter {
  private readonly clock: () => Date
  private readonly inspection: MarketplacePackageArtifactInspectionPort
  private readonly maxByteLength: number
  private readonly trust: MarketplaceCatalogTrustReaderPort

  constructor(options: VerifiedMarketplacePackageArtifactAdapterOptions) {
    this.clock = options.clock ?? (() => new Date())
    this.inspection = options.inspection
    this.maxByteLength = options.maxByteLength ?? MAX_MARKETPLACE_PACKAGE_BYTES
    this.trust = options.trust
    if (!Number.isSafeInteger(this.maxByteLength)
      || this.maxByteLength < 1
      || this.maxByteLength > MAX_MARKETPLACE_PACKAGE_BYTES) {
      throw new Error('Marketplace package artifact maximum byte limit is invalid')
    }
  }

  openVerificationPort(): MarketplacePackageArtifactVerificationPort {
    return Object.freeze({
      verify: (request: MarketplacePackageArtifactVerificationRequest) => this.verify(request),
    })
  }

  private async verify(
    request: MarketplacePackageArtifactVerificationRequest,
  ): Promise<MarketplacePackageArtifactVerificationEvidence> {
    if (!request || typeof request !== 'object') {
      throw new Error('Marketplace package artifact verification request is invalid')
    }
    if (typeof request.artifactPath !== 'string'
      || request.artifactPath.length < 1
      || request.artifactPath.length > 32_767
      || !path.isAbsolute(request.artifactPath)) {
      throw new Error('Marketplace package artifact path must be an absolute Main-process path')
    }
    const descriptor = MarketplacePackageArtifactDescriptorSchema.parse(request.descriptor)
    const signature = MarketplaceSignatureSchema.parse(request.signature)
    if (descriptor.byteLength > this.maxByteLength) {
      throw new Error('Marketplace package artifact exceeds the configured maximum byte limit')
    }

    const source = this.trust.getSource(descriptor.sourceId)
    if (!source || signature.keyId !== source.keyId) {
      throw new Error('Marketplace package artifact does not use a trusted signing key')
    }
    const signatureValid = this.trust.verify({
      keyId: signature.keyId,
      payload: serializeMarketplacePackageArtifactDescriptor(descriptor),
      signature: signature.value,
      sourceId: descriptor.sourceId,
    })
    if (!signatureValid) {
      throw new Error('Marketplace package artifact signature verification failed')
    }

    const inspection = await this.inspection.inspect({
      artifactPath: request.artifactPath,
      maxByteLength: this.maxByteLength,
    })
    if (inspection.byteLength !== descriptor.byteLength) {
      throw new Error('Marketplace package artifact byte length does not match the signed descriptor')
    }
    if (inspection.sha256 !== descriptor.sha256) {
      throw new Error('Marketplace package artifact SHA-256 digest does not match the signed descriptor')
    }

    return Object.freeze({
      artifactPath: request.artifactPath,
      descriptor,
      signatureKeyId: signature.keyId,
      status: 'verified' as const,
      verifiedAt: this.clock().toISOString(),
    })
  }
}
