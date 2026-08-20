import type { MarketplaceExtractedPackageEvidence } from '../../shared/marketplace-archive-contracts'
import type { MarketplaceCapabilityReviewEvidence } from '../../shared/marketplace-capability-contracts'
import type { MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import type {
  MarketplaceInstallationBeginRequest,
  MarketplaceInstallationDeleteRequest,
  MarketplaceInstallationRecord,
  MarketplaceInstallationTransitionRequest,
} from '../../shared/marketplace-installation-contracts'
import type { MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'

export interface MarketplaceInstallationStorageStageRequest {
  readonly evidence: MarketplaceExtractedPackageEvidence
  readonly identity: MarketplacePackageArtifactIdentity
  readonly sourceRoot: string
}

export interface MarketplaceStagedInstallationPort {
  commit(): Promise<void>
  rollback(): Promise<void>
  readonly storageKey: string
}

export interface MarketplaceInstallationStoragePort {
  exists(identity: MarketplacePackageArtifactIdentity): Promise<boolean>
  keyFor(identity: MarketplacePackageArtifactIdentity): string
  remove(identity: MarketplacePackageArtifactIdentity): Promise<void>
  stage(request: MarketplaceInstallationStorageStageRequest): Promise<MarketplaceStagedInstallationPort>
}

export interface MarketplaceInstallationRegistryReaderPort {
  get(identity: MarketplacePackageArtifactIdentity): MarketplaceInstallationRecord | null
  listInstalled(): readonly MarketplaceInstallationRecord[]
  listRecoverable(): readonly MarketplaceInstallationRecord[]
}

export interface MarketplaceInstallationRegistryWriterPort {
  begin(request: MarketplaceInstallationBeginRequest): MarketplaceInstallationRecord
  delete(request: MarketplaceInstallationDeleteRequest): void
  transition(request: MarketplaceInstallationTransitionRequest): MarketplaceInstallationRecord
}

export interface MarketplaceInstallationPort {
  install(
    packagePort: MarketplaceBoundPackagePort,
    review: MarketplaceCapabilityReviewEvidence,
  ): Promise<MarketplaceInstallationRecord>
}

export interface MarketplaceInstallationLifecyclePort {
  uninstall(identity: MarketplacePackageArtifactIdentity, expectedRevision: number): Promise<void>
}

export interface MarketplaceInstallationRecoveryResult {
  readonly action: 'failed-storage-cleaned' | 'installation-failed-cleaned' | 'removal-completed'
  readonly identity: MarketplacePackageArtifactIdentity
}

export interface MarketplaceInstallationRecoveryPort {
  recover(): Promise<readonly MarketplaceInstallationRecoveryResult[]>
}
