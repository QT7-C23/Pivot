import { z } from 'zod'
import {
  MarketplaceCapabilityReviewEvidenceSchema,
  riskForCapabilities,
} from '../../shared/marketplace-capability-contracts'
import {
  MarketplaceCapabilitySchema,
  MarketplacePackageManifestSchema,
  type MarketplaceCapability,
} from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'
import type { MarketplaceCapabilityReviewPort } from './marketplace-capability-review-ports'

const ApprovalSchema = z.array(MarketplaceCapabilitySchema).max(32)
const globallyRejected = new Set<MarketplaceCapability>(['process.spawn', 'secrets.read'])
const allowedByKind: Record<'plugin' | 'prompt' | 'skill' | 'theme', ReadonlySet<MarketplaceCapability>> = {
  plugin: new Set(['mcp.connect', 'network.fetch', 'ui.contribute', 'workspace.read', 'workspace.write']),
  prompt: new Set(),
  skill: new Set(['workspace.read']),
  theme: new Set(),
}

export class MarketplaceCapabilityReviewAdapter {
  private readonly clock: () => Date

  constructor(options: { readonly clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date())
  }

  openReviewPort(): MarketplaceCapabilityReviewPort {
    return Object.freeze({
      review: (packagePort: MarketplaceBoundPackagePort, approvals: readonly MarketplaceCapability[]) =>
        this.review(packagePort, approvals),
    })
  }

  private review(
    packagePort: MarketplaceBoundPackagePort,
    approvalInput: readonly MarketplaceCapability[],
  ) {
    const manifest = MarketplacePackageManifestSchema.parse(packagePort?.manifest)
    const approvals = ApprovalSchema.parse(approvalInput)
    if (new Set(approvals).size !== approvals.length) {
      throw new Error('Marketplace capability approvals must be unique')
    }
    const declared = new Set<MarketplaceCapability>(manifest.capabilities)
    if (approvals.some((capability) => !declared.has(capability))) {
      throw new Error('Marketplace capability approval was not declared by the package')
    }
    const forbidden = manifest.capabilities.find((capability) =>
      globallyRejected.has(capability) || !allowedByKind[manifest.identity.kind].has(capability))
    const status = forbidden
      ? 'rejected'
      : approvals.length === manifest.capabilities.length ? 'approved' : 'requires-approval'
    return MarketplaceCapabilityReviewEvidenceSchema.parse({
      approvedCapabilities: approvals,
      declaredCapabilities: manifest.capabilities,
      identity: manifest.identity,
      reason: forbidden ? `Capability ${forbidden} is not permitted for ${manifest.identity.kind} packages` : undefined,
      reviewedAt: this.clock().toISOString(),
      riskLevel: riskForCapabilities(manifest.capabilities),
      schemaVersion: 1,
      status,
    })
  }
}
