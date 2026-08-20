import {
  MarketplaceArchiveInventorySchema,
  MarketplaceExtractedPackageEvidenceSchema,
} from '../../shared/marketplace-archive-contracts'
import type {
  MarketplaceArchiveExtractionPort,
  MarketplaceArchiveInspectionPort,
  MarketplaceExtractedPackagePort,
  MarketplacePackageArchivePreparationPort,
} from './marketplace-package-archive-ports'
import type {
  MarketplaceStagedArtifactReadLeasePort,
  MarketplaceVerifiedStagedArtifactPort,
} from './marketplace-package-download-ports'

export class VerifiedMarketplacePackageArchiveAdapter {
  private readonly extraction: MarketplaceArchiveExtractionPort
  private readonly inspection: MarketplaceArchiveInspectionPort

  constructor(options: {
    readonly extraction: MarketplaceArchiveExtractionPort
    readonly inspection: MarketplaceArchiveInspectionPort
  }) {
    this.extraction = options.extraction
    this.inspection = options.inspection
  }

  openPreparationPort(): MarketplacePackageArchivePreparationPort {
    return Object.freeze({
      prepare: (source: MarketplaceVerifiedStagedArtifactPort, signal?: AbortSignal) =>
        this.prepare(source, signal),
    })
  }

  private async prepare(
    source: MarketplaceVerifiedStagedArtifactPort,
    signal?: AbortSignal,
  ): Promise<MarketplaceExtractedPackagePort> {
    requireVerifiedSource(source)
    requireNotAborted(signal)
    const inventory = MarketplaceArchiveInventorySchema.parse(
      await withReadLease(source, (lease) => this.inspection.inspect({ source: lease })),
    )
    requireNotAborted(signal)
    const extracted = await withReadLease(source, (lease) => this.extraction.extract({
      expectedInventory: inventory,
      signal,
      source: lease,
    }))
    try {
      const evidence = MarketplaceExtractedPackageEvidenceSchema.parse(extracted.evidence)
      if (JSON.stringify(evidence.inventory) !== JSON.stringify(inventory)) {
        throw new Error('Marketplace package archive inventory changed before extraction')
      }
      requireNotAborted(signal)
      return Object.freeze({
        discard: () => extracted.discard(),
        evidence,
        rootPath: extracted.rootPath,
      })
    } catch (error) {
      try {
        await extracted.discard()
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Marketplace package archive preparation failed and cleanup was incomplete',
        )
      }
      throw error
    }
  }
}

async function withReadLease<T>(
  source: MarketplaceVerifiedStagedArtifactPort,
  operation: (lease: MarketplaceStagedArtifactReadLeasePort) => Promise<T>,
): Promise<T> {
  const lease = await source.acquireReadLease()
  if (lease.artifactPath !== source.artifactPath) {
    await lease.release()
    throw new Error('Marketplace staged read lease belongs to another artifact')
  }
  try {
    const result = await operation(lease)
    await lease.release()
    return result
  } catch (error) {
    try {
      await lease.release()
    } catch (releaseError) {
      throw new AggregateError([error, releaseError], 'Marketplace staged read lease release failed')
    }
    throw error
  }
}

function requireVerifiedSource(source: MarketplaceVerifiedStagedArtifactPort): void {
  if (!source || typeof source !== 'object'
    || typeof source.artifactPath !== 'string'
    || source.evidence?.status !== 'verified'
    || source.evidence.artifactPath !== source.artifactPath
    || typeof source.acquireReadLease !== 'function'
    || typeof source.discard !== 'function') {
    throw new Error('Marketplace archive preparation requires a verified staged artifact')
  }
}

function requireNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Marketplace package archive preparation was cancelled')
}
