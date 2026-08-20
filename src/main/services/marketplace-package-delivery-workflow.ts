import {
  MarketplaceInstallRequestSchema,
  MarketplaceInstallResultSchema,
  MarketplaceInstallationSummarySchema,
  type MarketplaceInstallRequest,
  type MarketplaceInstallResult,
} from '../../shared/marketplace-delivery-contracts'
import {
  marketplacePackageDownloadIntentFromCatalogEntry,
  type MarketplaceCatalogEntry,
} from '../../shared/marketplace-contracts'
import type { MarketplaceCatalogReaderPort } from './marketplace-ports'
import type { MarketplacePackageDownloadPort, MarketplaceVerifiedStagedArtifactPort } from './marketplace-package-download-ports'
import type { MarketplacePackageArchivePreparationPort, MarketplaceExtractedPackagePort } from './marketplace-package-archive-ports'
import type { MarketplacePackageManifestReaderPort } from './marketplace-package-manifest-ports'
import type { MarketplacePackageBindingPort, MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'
import type { MarketplaceCapabilityReviewPort } from './marketplace-capability-review-ports'
import type { MarketplaceInstallationPort } from './marketplace-installation-ports'

export interface MarketplacePackageDeliveryPort {
  install(request: MarketplaceInstallRequest, signal?: AbortSignal): Promise<MarketplaceInstallResult>
}

export class MarketplacePackageDeliveryWorkflow {
  private readonly archive: MarketplacePackageArchivePreparationPort
  private readonly binding: MarketplacePackageBindingPort
  private readonly catalog: MarketplaceCatalogReaderPort
  private readonly download: MarketplacePackageDownloadPort
  private readonly installation: MarketplaceInstallationPort
  private readonly manifests: MarketplacePackageManifestReaderPort
  private readonly reviews: MarketplaceCapabilityReviewPort

  constructor(options: {
    readonly archive: MarketplacePackageArchivePreparationPort
    readonly binding: MarketplacePackageBindingPort
    readonly catalog: MarketplaceCatalogReaderPort
    readonly download: MarketplacePackageDownloadPort
    readonly installation: MarketplaceInstallationPort
    readonly manifests: MarketplacePackageManifestReaderPort
    readonly reviews: MarketplaceCapabilityReviewPort
  }) {
    this.archive = options.archive
    this.binding = options.binding
    this.catalog = options.catalog
    this.download = options.download
    this.installation = options.installation
    this.manifests = options.manifests
    this.reviews = options.reviews
  }

  openDeliveryPort(): MarketplacePackageDeliveryPort {
    return Object.freeze({
      install: (request: MarketplaceInstallRequest, signal?: AbortSignal) => this.install(request, signal),
    })
  }

  async install(input: MarketplaceInstallRequest, signal?: AbortSignal): Promise<MarketplaceInstallResult> {
    const request = MarketplaceInstallRequestSchema.parse(input)
    const snapshot = await this.catalog.readSnapshot()
    if (snapshot.revision !== request.expectedCatalogRevision) {
      throw new Error('Marketplace Catalog revision is stale')
    }
    const entry = findEntry(snapshot.entries, request)
    let staged: MarketplaceVerifiedStagedArtifactPort | undefined
    let extracted: MarketplaceExtractedPackagePort | undefined
    let bound: MarketplaceBoundPackagePort | undefined
    let operationError: unknown
    try {
      staged = await this.download.downloadAndVerify(
        marketplacePackageDownloadIntentFromCatalogEntry(entry),
        signal,
      )
      extracted = await this.archive.prepare(staged, signal)
      const verifiedManifest = await this.manifests.read(extracted)
      bound = this.binding.bind({
        artifactEvidence: staged.evidence,
        catalogEntry: entry,
        extracted,
        verifiedManifest,
      })
      const review = await this.reviews.review(bound, request.approvedCapabilities)
      if (review.status === 'requires-approval') {
        return MarketplaceInstallResultSchema.parse({
          declaredCapabilities: review.declaredCapabilities,
          riskLevel: review.riskLevel,
          status: review.status,
        })
      }
      if (review.status === 'rejected') {
        return MarketplaceInstallResultSchema.parse({
          declaredCapabilities: review.declaredCapabilities,
          reason: review.reason,
          riskLevel: review.riskLevel,
          status: review.status,
        })
      }
      const installation = await this.installation.install(bound, review)
      return MarketplaceInstallResultSchema.parse({
        installation: MarketplaceInstallationSummarySchema.parse({
          capabilities: installation.capabilities,
          identity: installation.identity,
          revision: installation.revision,
          state: installation.state,
        }),
        status: 'installed',
      })
    } catch (error) {
      operationError = error
      throw error
    } finally {
      const cleanupErrors: unknown[] = []
      try {
        if (bound) await bound.discard()
        else if (extracted) await extracted.discard()
      } catch (error) { cleanupErrors.push(error) }
      try { await staged?.discard() } catch (error) { cleanupErrors.push(error) }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          operationError === undefined ? cleanupErrors : [operationError, ...cleanupErrors],
          'Marketplace package delivery cleanup was incomplete',
        )
      }
    }
  }
}

function findEntry(
  entries: readonly MarketplaceCatalogEntry[],
  request: MarketplaceInstallRequest,
): MarketplaceCatalogEntry {
  const matches = entries.filter((entry) => entry.sourceId === request.sourceId
    && entry.kind === request.kind && entry.resourceId === request.resourceId)
  if (matches.length !== 1) throw new Error('Marketplace Catalog resource was not found uniquely')
  return matches[0]!
}
