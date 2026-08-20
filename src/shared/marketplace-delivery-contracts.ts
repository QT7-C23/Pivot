import { z } from 'zod'
import { MarketplaceResourceKindSchema, MarketplacePackageArtifactIdentitySchema } from './marketplace-contracts'
import { MarketplaceInstallationStateSchema } from './marketplace-installation-contracts'
import { MarketplaceCapabilitySchema } from './marketplace-package-manifest-contracts'
import { MarketplaceUpdateRecordSchema } from './marketplace-update-contracts'

const StableIdentifierSchema = z.string().trim().min(1).max(160).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
)

export const MarketplaceInstallRequestSchema = z.object({
  approvedCapabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  expectedCatalogRevision: z.number().int().nonnegative(),
  kind: MarketplaceResourceKindSchema,
  resourceId: StableIdentifierSchema,
  sourceId: StableIdentifierSchema,
}).strict().superRefine((request, context) => {
  if (new Set(request.approvedCapabilities).size !== request.approvedCapabilities.length) {
    context.addIssue({ code: 'custom', message: 'Marketplace install approvals must be unique' })
  }
}).readonly()

export const MarketplaceInstallationSummarySchema = z.object({
  capabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  identity: MarketplacePackageArtifactIdentitySchema,
  revision: z.number().int().nonnegative(),
  state: MarketplaceInstallationStateSchema,
}).strict().readonly()

export const MarketplaceInstallResultSchema = z.discriminatedUnion('status', [
  z.object({
    declaredCapabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
    riskLevel: z.enum(['none', 'low', 'medium', 'high']),
    status: z.literal('requires-approval'),
  }).strict().readonly(),
  z.object({
    declaredCapabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
    reason: z.string().trim().min(1).max(1_000),
    riskLevel: z.enum(['none', 'low', 'medium', 'high']),
    status: z.literal('rejected'),
  }).strict().readonly(),
  z.object({
    installation: MarketplaceInstallationSummarySchema,
    status: z.literal('installed'),
  }).strict().readonly(),
])

export const MarketplaceInstallationCollectionSchema = z.object({
  items: z.array(MarketplaceInstallationSummarySchema).max(10_000).readonly(),
  schemaVersion: z.literal(1),
}).strict().readonly()

export const MarketplaceUninstallRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  identity: MarketplacePackageArtifactIdentitySchema,
}).strict().readonly()

export const MarketplaceUpdateDeliveryRequestSchema = z.object({
  approvedCapabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  currentIdentity: MarketplacePackageArtifactIdentitySchema,
  expectedCatalogRevision: z.number().int().nonnegative(),
  expectedCurrentRevision: z.number().int().nonnegative(),
  kind: MarketplaceResourceKindSchema,
  resourceId: StableIdentifierSchema,
  sourceId: StableIdentifierSchema,
}).strict().superRefine((request, context) => {
  if (new Set(request.approvedCapabilities).size !== request.approvedCapabilities.length) {
    context.addIssue({ code: 'custom', message: 'Marketplace update approvals must be unique' })
  }
  if (request.currentIdentity.sourceId !== request.sourceId
    || request.currentIdentity.kind !== request.kind
    || request.currentIdentity.resourceId !== request.resourceId) {
    context.addIssue({ code: 'custom', message: 'Marketplace update request must target the installed resource' })
  }
})

export const MarketplaceUpdateDeliveryResultSchema = z.discriminatedUnion('status', [
  MarketplaceInstallResultSchema.options[0],
  MarketplaceInstallResultSchema.options[1],
  z.object({ status: z.literal('ready'), update: MarketplaceUpdateRecordSchema }).strict().readonly(),
])

export type MarketplaceInstallRequest = z.infer<typeof MarketplaceInstallRequestSchema>
export type MarketplaceInstallResult = z.infer<typeof MarketplaceInstallResultSchema>
export type MarketplaceInstallationSummary = z.infer<typeof MarketplaceInstallationSummarySchema>
export type MarketplaceInstallationCollection = z.infer<typeof MarketplaceInstallationCollectionSchema>
export type MarketplaceUninstallRequest = z.infer<typeof MarketplaceUninstallRequestSchema>
export type MarketplaceUpdateDeliveryRequest = z.infer<typeof MarketplaceUpdateDeliveryRequestSchema>
export type MarketplaceUpdateDeliveryResult = z.infer<typeof MarketplaceUpdateDeliveryResultSchema>
