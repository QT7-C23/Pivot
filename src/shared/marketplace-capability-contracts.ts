import { z } from 'zod'
import { MarketplacePackageArtifactIdentitySchema } from './marketplace-contracts'
import {
  MarketplaceCapabilitySchema,
  type MarketplaceCapability,
} from './marketplace-package-manifest-contracts'

export const MarketplaceCapabilityRiskSchema = z.enum(['none', 'low', 'medium', 'high', 'critical'])

export const MarketplaceCapabilityReviewEvidenceSchema = z.object({
  approvedCapabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  declaredCapabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  identity: MarketplacePackageArtifactIdentitySchema,
  reason: z.string().trim().min(1).max(500).optional(),
  reviewedAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid review timestamp'),
  riskLevel: MarketplaceCapabilityRiskSchema,
  schemaVersion: z.literal(1),
  status: z.enum(['approved', 'requires-approval', 'rejected']),
}).strict().superRefine((evidence, context) => {
  if (new Set(evidence.declaredCapabilities).size !== evidence.declaredCapabilities.length
    || new Set(evidence.approvedCapabilities).size !== evidence.approvedCapabilities.length) {
    context.addIssue({ code: 'custom', message: 'Capability declarations and approvals must be unique' })
  }
  const declared = new Set<MarketplaceCapability>(evidence.declaredCapabilities)
  if (evidence.approvedCapabilities.some((capability) => !declared.has(capability))) {
    context.addIssue({ code: 'custom', message: 'Approved capabilities must be declared by the package' })
  }
  if (evidence.riskLevel !== riskForCapabilities(evidence.declaredCapabilities)) {
    context.addIssue({ code: 'custom', message: 'Capability risk level does not match declarations' })
  }
  if (evidence.status === 'approved'
    && evidence.approvedCapabilities.length !== evidence.declaredCapabilities.length) {
    context.addIssue({ code: 'custom', message: 'Approved status requires exactly all declared approvals' })
  }
  if (evidence.status === 'rejected' && !evidence.reason) {
    context.addIssue({ code: 'custom', message: 'Rejected capability review requires a reason' })
  }
  if (evidence.status !== 'rejected' && evidence.reason) {
    context.addIssue({ code: 'custom', message: 'Only rejected capability review may contain a reason' })
  }
}).readonly()

export type MarketplaceCapabilityReviewEvidence = z.infer<typeof MarketplaceCapabilityReviewEvidenceSchema>

export function riskForCapabilities(capabilities: readonly MarketplaceCapability[]) {
  let risk: z.infer<typeof MarketplaceCapabilityRiskSchema> = 'none'
  const weight = { none: 0, low: 1, medium: 2, high: 3, critical: 4 } as const
  for (const capability of capabilities) {
    const next = capability === 'process.spawn' || capability === 'secrets.read'
      ? 'critical'
      : capability === 'workspace.write'
        ? 'high'
        : capability === 'mcp.connect' || capability === 'network.fetch'
          ? 'medium'
          : 'low'
    if (weight[next] > weight[risk]) risk = next
  }
  return risk
}
