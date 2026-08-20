import { MarketplacePackageArtifactIdentitySchema, type MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import type {
  MarketplaceInstallationLifecyclePort,
  MarketplaceInstallationRecoveryPort,
  MarketplaceInstallationRecoveryResult,
  MarketplaceInstallationRegistryReaderPort,
  MarketplaceInstallationRegistryWriterPort,
  MarketplaceInstallationStoragePort,
} from './marketplace-installation-ports'

export class MarketplaceInstallationLifecycleCoordinator {
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

  openLifecyclePort(): MarketplaceInstallationLifecyclePort {
    return Object.freeze({
      uninstall: (identity: MarketplacePackageArtifactIdentity, expectedRevision: number) =>
        this.uninstall(identity, expectedRevision),
    })
  }

  openRecoveryPort(): MarketplaceInstallationRecoveryPort {
    return Object.freeze({ recover: () => this.recover() })
  }

  private async uninstall(identityInput: MarketplacePackageArtifactIdentity, expectedRevision: number): Promise<void> {
    const identity = MarketplacePackageArtifactIdentitySchema.parse(identityInput)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error('Marketplace uninstall expected revision is invalid')
    }
    const current = this.registryReader.get(identity)
    if (!current || current.state !== 'installed') {
      throw new Error('Marketplace uninstall requires an installed package')
    }
    if (current.revision !== expectedRevision) {
      throw new Error('Marketplace uninstall revision is stale')
    }
    const removing = this.registryWriter.transition({
      expectedRevision,
      identity,
      state: 'removing',
    })
    try {
      await this.storage.remove(identity)
      this.registryWriter.delete({ expectedRevision: removing.revision, identity })
    } catch (error) {
      try {
        const latest = this.registryReader.get(identity)
        if (latest?.state === 'removing') {
          this.registryWriter.transition({
            error: messageOf(error),
            expectedRevision: latest.revision,
            identity,
            state: 'failed',
          })
        }
      } catch (registryError) {
        throw new AggregateError(
          [error, registryError],
          'Marketplace uninstall failed and failure evidence could not be committed',
        )
      }
      throw error
    }
  }

  private async recover(): Promise<readonly MarketplaceInstallationRecoveryResult[]> {
    const records = this.registryReader.listRecoverable()
    const results: MarketplaceInstallationRecoveryResult[] = []
    const failures: unknown[] = []
    for (const record of records) {
      try {
        await this.storage.remove(record.identity)
        if (record.state === 'installing') {
          this.registryWriter.transition({
            error: 'Recovered interrupted Marketplace installation after restart',
            expectedRevision: record.revision,
            identity: record.identity,
            state: 'failed',
          })
          results.push(Object.freeze({ action: 'installation-failed-cleaned', identity: record.identity }))
        } else if (record.state === 'removing') {
          this.registryWriter.delete({ expectedRevision: record.revision, identity: record.identity })
          results.push(Object.freeze({ action: 'removal-completed', identity: record.identity }))
        } else {
          results.push(Object.freeze({ action: 'failed-storage-cleaned', identity: record.identity }))
        }
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Marketplace installation recovery was incomplete')
    }
    return Object.freeze(results)
  }
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown Marketplace uninstall failure'
  return message.slice(0, 1_000) || 'Unknown Marketplace uninstall failure'
}
