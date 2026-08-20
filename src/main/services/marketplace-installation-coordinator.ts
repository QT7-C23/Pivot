import { MarketplaceExtractedPackageEvidenceSchema } from '../../shared/marketplace-archive-contracts'
import { MarketplaceCapabilityReviewEvidenceSchema } from '../../shared/marketplace-capability-contracts'
import { MarketplacePackageManifestSchema } from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplaceCapabilityReviewEvidence } from '../../shared/marketplace-capability-contracts'
import type { MarketplaceInstallationRecord } from '../../shared/marketplace-installation-contracts'
import type { MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'
import type {
  MarketplaceInstallationPort,
  MarketplaceInstallationRegistryReaderPort,
  MarketplaceInstallationRegistryWriterPort,
  MarketplaceInstallationStoragePort,
  MarketplaceStagedInstallationPort,
} from './marketplace-installation-ports'

export class MarketplaceInstallationCoordinator {
  private readonly registryReader: MarketplaceInstallationRegistryReaderPort
  private readonly registryWriter: MarketplaceInstallationRegistryWriterPort
  private readonly storage: MarketplaceInstallationStoragePort

  constructor(options: {
    readonly registryReader: MarketplaceInstallationRegistryReaderPort
    readonly registryWriter: MarketplaceInstallationRegistryWriterPort
    readonly storage: MarketplaceInstallationStoragePort
  }) {
    this.registryReader = options.registryReader
    this.registryWriter = options.registryWriter
    this.storage = options.storage
  }

  openInstallationPort(): MarketplaceInstallationPort {
    return Object.freeze({
      install: (
        packagePort: MarketplaceBoundPackagePort,
        review: MarketplaceCapabilityReviewEvidence,
      ) => this.install(packagePort, review),
    })
  }

  private async install(
    packagePort: MarketplaceBoundPackagePort,
    reviewInput: MarketplaceCapabilityReviewEvidence,
  ): Promise<MarketplaceInstallationRecord> {
    const manifest = MarketplacePackageManifestSchema.parse(packagePort?.manifest)
    const evidence = MarketplaceExtractedPackageEvidenceSchema.parse(packagePort?.extractionEvidence)
    const review = MarketplaceCapabilityReviewEvidenceSchema.parse(reviewInput)
    if (review.status !== 'approved') throw new Error('Marketplace installation requires approved capabilities')
    if (JSON.stringify(review.identity) !== JSON.stringify(manifest.identity)
      || JSON.stringify(review.approvedCapabilities) !== JSON.stringify(manifest.capabilities)) {
      throw new Error('Marketplace installation capability review does not match its package')
    }
    const storageKey = this.storage.keyFor(manifest.identity)
    const manifestFile = evidence.files.find((file) => file.path === 'pivot-package.json')
    if (!manifestFile) throw new Error('Marketplace installation requires manifest file evidence')
    const manifestEvidence = { ...manifestFile, path: 'pivot-package.json' as const }
    const installing = this.registryWriter.begin({ manifestEvidence, review, storageKey })
    let staged: MarketplaceStagedInstallationPort | undefined
    let committed = false
    try {
      staged = await this.storage.stage({
        evidence,
        identity: manifest.identity,
        sourceRoot: packagePort.rootPath,
      })
      if (staged.storageKey !== storageKey) {
        throw new Error('Marketplace installation storage identity does not match its registry')
      }
      await staged.commit()
      committed = true
      return this.registryWriter.transition({
        expectedRevision: installing.revision,
        identity: manifest.identity,
        state: 'installed',
      })
    } catch (error) {
      const cleanupErrors: unknown[] = []
      try {
        if (committed) await this.storage.remove(manifest.identity)
        else await staged?.rollback()
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
      try {
        const current = this.registryReader.get(manifest.identity)
        if (current?.state === 'installing') {
          this.registryWriter.transition({
            error: messageOf(error),
            expectedRevision: current.revision,
            identity: manifest.identity,
            state: 'failed',
          })
        }
      } catch (registryError) {
        cleanupErrors.push(registryError)
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], 'Marketplace installation failed and rollback was incomplete')
      }
      throw error
    }
  }
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown Marketplace installation failure'
  return message.slice(0, 1_000) || 'Unknown Marketplace installation failure'
}
