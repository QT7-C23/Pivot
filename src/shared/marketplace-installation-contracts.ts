import { z } from 'zod'
import { MarketplaceCapabilityReviewEvidenceSchema } from './marketplace-capability-contracts'
import { MarketplacePackageArtifactIdentitySchema } from './marketplace-contracts'
import { MarketplaceCapabilitySchema } from './marketplace-package-manifest-contracts'

const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid installation timestamp',
)
const StorageKeySchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid installation storage key')
const ManifestEvidenceSchema = z.object({
  byteLength: z.number().int().positive().max(256 * 1024),
  path: z.literal('pivot-package.json'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().readonly()

export const MarketplaceInstallationStateSchema = z.enum([
  'failed',
  'installed',
  'installing',
  'removing',
])

export const MarketplaceInstallationRecordSchema = z.object({
  capabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  createdAt: TimestampSchema,
  error: z.string().trim().min(1).max(1_000).optional(),
  identity: MarketplacePackageArtifactIdentitySchema,
  manifestEvidence: ManifestEvidenceSchema.optional(),
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  state: MarketplaceInstallationStateSchema,
  storageKey: StorageKeySchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  if (new Set(record.capabilities).size !== record.capabilities.length) {
    context.addIssue({ code: 'custom', message: 'Installed capabilities must be unique' })
  }
  if (record.state === 'failed' && !record.error) {
    context.addIssue({ code: 'custom', message: 'Failed installation requires an error' })
  }
  if (record.state !== 'failed' && record.error) {
    context.addIssue({ code: 'custom', message: 'Only failed installation may contain an error' })
  }
}).readonly()

export const MarketplaceInstallationBeginRequestSchema = z.object({
  manifestEvidence: ManifestEvidenceSchema.optional(),
  review: MarketplaceCapabilityReviewEvidenceSchema,
  storageKey: StorageKeySchema,
}).strict().superRefine((request, context) => {
  if (request.review.status !== 'approved') {
    context.addIssue({ code: 'custom', message: 'Installation requires approved capability review' })
  }
}).readonly()

export const MarketplaceInstallationTransitionRequestSchema = z.object({
  error: z.string().trim().min(1).max(1_000).optional(),
  expectedRevision: z.number().int().nonnegative(),
  identity: MarketplacePackageArtifactIdentitySchema,
  state: z.enum(['failed', 'installed', 'removing']),
}).strict().superRefine((request, context) => {
  if (request.state === 'failed' && !request.error) {
    context.addIssue({ code: 'custom', message: 'Failed transition requires an error' })
  }
  if (request.state !== 'failed' && request.error) {
    context.addIssue({ code: 'custom', message: 'Only failed transition may contain an error' })
  }
}).readonly()

export const MarketplaceInstallationDeleteRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  identity: MarketplacePackageArtifactIdentitySchema,
}).strict().readonly()

export type MarketplaceInstallationRecord = z.infer<typeof MarketplaceInstallationRecordSchema>
export type MarketplaceInstallationBeginRequest = z.infer<typeof MarketplaceInstallationBeginRequestSchema>
export type MarketplaceInstallationTransitionRequest = z.infer<typeof MarketplaceInstallationTransitionRequestSchema>
export type MarketplaceInstallationDeleteRequest = z.infer<typeof MarketplaceInstallationDeleteRequestSchema>
