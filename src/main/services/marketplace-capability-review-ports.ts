import type { MarketplaceCapabilityReviewEvidence } from '../../shared/marketplace-capability-contracts'
import type { MarketplaceCapability } from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'

export interface MarketplaceCapabilityReviewPort {
  review(
    packagePort: MarketplaceBoundPackagePort,
    approvedCapabilities: readonly MarketplaceCapability[],
  ): MarketplaceCapabilityReviewEvidence
}
