import {
  MarketplacePackageDownloadIntentSchema,
  serializeMarketplacePackageArtifactDescriptor,
} from '../../shared/marketplace-contracts'
import type { MarketplacePackageDownloadIntent } from '../../shared/marketplace-contracts'
import type { MarketplaceCatalogTrustReaderPort } from './marketplace-catalog-ports'
import type { MarketplacePackageArtifactVerificationPort } from './marketplace-package-artifact-ports'
import type {
  MarketplacePackageDownloadPort,
  MarketplacePackageStagingPort,
  MarketplaceVerifiedStagedArtifactPort,
} from './marketplace-package-download-ports'

export class VerifiedMarketplacePackageDownloadAdapter {
  private readonly staging: MarketplacePackageStagingPort
  private readonly trust: MarketplaceCatalogTrustReaderPort
  private readonly verification: MarketplacePackageArtifactVerificationPort

  constructor(options: {
    readonly staging: MarketplacePackageStagingPort
    readonly trust: MarketplaceCatalogTrustReaderPort
    readonly verification: MarketplacePackageArtifactVerificationPort
  }) {
    this.staging = options.staging
    this.trust = options.trust
    this.verification = options.verification
  }

  openDownloadPort(): MarketplacePackageDownloadPort {
    return Object.freeze({
      downloadAndVerify: (intent: MarketplacePackageDownloadIntent, signal?: AbortSignal) =>
        this.downloadAndVerify(intent, signal),
    })
  }

  private async downloadAndVerify(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<MarketplaceVerifiedStagedArtifactPort> {
    if (signal?.aborted) throw new Error('Marketplace package download was cancelled')
    const intent = MarketplacePackageDownloadIntentSchema.parse(input)
    const source = this.trust.getSource(intent.descriptor.sourceId)
    if (!source || intent.signature.keyId !== source.keyId) {
      throw new Error('Marketplace package download does not use a trusted source and key')
    }
    const downloadUrl = requirePublicPackageUrl(intent.downloadUrl)
    const catalogUrl = new URL(source.catalogUrl)
    if (downloadUrl.origin !== catalogUrl.origin) {
      throw new Error('Marketplace package download origin must match its trusted Catalog origin')
    }
    if (!this.trust.verify({
      keyId: intent.signature.keyId,
      payload: serializeMarketplacePackageArtifactDescriptor(intent.descriptor),
      signature: intent.signature.value,
      sourceId: intent.descriptor.sourceId,
    })) {
      throw new Error('Marketplace package signature verification failed before download')
    }

    const staged = await this.staging.stage({
      downloadUrl: downloadUrl.href,
      expectedByteLength: intent.descriptor.byteLength,
      signal,
    })
    try {
      const evidence = await this.verification.verify({
        artifactPath: staged.artifactPath,
        descriptor: intent.descriptor,
        signature: intent.signature,
      })
      if (evidence.artifactPath !== staged.artifactPath) {
        throw new Error('Marketplace package verifier returned evidence for another artifact')
      }
      return Object.freeze({
        acquireReadLease: () => staged.acquireReadLease(),
        artifactPath: staged.artifactPath,
        discard: () => staged.discard(),
        evidence,
      })
    } catch (error) {
      try {
        await staged.discard()
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Marketplace package verification failed and staged cleanup was incomplete',
        )
      }
      throw error
    }
  }
}

function requirePublicPackageUrl(input: string): URL {
  const url = new URL(input)
  if (url.protocol !== 'https:') throw new Error('Marketplace package download requires HTTPS')
  if (url.username || url.password) throw new Error('Marketplace package URL cannot contain credentials')
  if (url.search) throw new Error('Marketplace package URL cannot contain a query string')
  if (url.hash) throw new Error('Marketplace package URL cannot contain a fragment')
  return url
}
