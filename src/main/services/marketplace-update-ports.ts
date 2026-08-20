import type { MarketplaceCapabilityReviewEvidence } from '../../shared/marketplace-capability-contracts'
import type { MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import type {
  MarketplaceUpdateBeginRequest,
  MarketplaceUpdateRecord,
  MarketplaceUpdateStageRequest,
  MarketplaceUpdateTransitionRequest,
  MarketplaceInstalledUpdateStageRequest,
} from '../../shared/marketplace-update-contracts'
import type { MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'

export interface MarketplaceResourceVersionSwitchPort {
  switchTo(identity: MarketplacePackageArtifactIdentity, installationRevision: number): Promise<void>
}

export interface MarketplaceUpdateEvidencePort {
  begin(request: MarketplaceUpdateBeginRequest): MarketplaceUpdateRecord
  find(updateId: string): MarketplaceUpdateRecord | null
  listReady(): readonly MarketplaceUpdateRecord[]
  transition(request: MarketplaceUpdateTransitionRequest): MarketplaceUpdateRecord
}

export interface MarketplaceUpdatePort {
  stage(
    request: MarketplaceUpdateStageRequest,
    packagePort: MarketplaceBoundPackagePort,
    review: MarketplaceCapabilityReviewEvidence,
  ): Promise<MarketplaceUpdateRecord>
  rollback(updateId: string, expectedRevision: number): Promise<MarketplaceUpdateRecord>
  finalize(updateId: string, expectedRevision: number): Promise<MarketplaceUpdateRecord>
  stageInstalled(request: MarketplaceInstalledUpdateStageRequest): Promise<MarketplaceUpdateRecord>
}
