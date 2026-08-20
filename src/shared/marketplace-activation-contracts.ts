import { z } from 'zod'
import { MarketplacePackageArtifactIdentitySchema } from './marketplace-contracts'
import { MarketplaceCapabilitySchema } from './marketplace-package-manifest-contracts'

const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid activation timestamp',
)

export const MarketplaceActivationRequestSchema = z.object({
  expectedInstallationRevision: z.number().int().nonnegative(),
  identity: MarketplacePackageArtifactIdentitySchema,
}).strict().readonly()

export const MarketplaceActivationRecordSchema = z.object({
  activatedAt: TimestampSchema,
  capabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  identity: MarketplacePackageArtifactIdentitySchema,
  installationRevision: z.number().int().nonnegative(),
  registrationId: z.string().regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    'Invalid activation registration id',
  ),
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  state: z.literal('active'),
}).strict().superRefine((record, context) => {
  if (new Set(record.capabilities).size !== record.capabilities.length) {
    context.addIssue({ code: 'custom', message: 'Activation capabilities must be unique' })
  }
}).readonly()

export const MarketplaceActivationCommitRequestSchema = z.object({
  capabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  identity: MarketplacePackageArtifactIdentitySchema,
  installationRevision: z.number().int().nonnegative(),
  registrationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
}).strict().readonly()

export const MarketplaceDeactivationRequestSchema = z.object({
  expectedActivationRevision: z.number().int().nonnegative(),
  identity: MarketplacePackageArtifactIdentitySchema,
}).strict().readonly()

export type MarketplaceActivationRequest = z.infer<typeof MarketplaceActivationRequestSchema>
export type MarketplaceActivationRecord = z.infer<typeof MarketplaceActivationRecordSchema>
export type MarketplaceActivationCommitRequest = z.infer<typeof MarketplaceActivationCommitRequestSchema>
export type MarketplaceDeactivationRequest = z.infer<typeof MarketplaceDeactivationRequestSchema>
