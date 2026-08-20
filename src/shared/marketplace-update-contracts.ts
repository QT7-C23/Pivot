import { z } from 'zod'
import { MarketplacePackageArtifactIdentitySchema } from './marketplace-contracts'

const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid Marketplace update timestamp',
)
const UpdateIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
const InstalledVersionSchema = z.object({
  identity: MarketplacePackageArtifactIdentitySchema,
  installationRevision: z.number().int().nonnegative(),
}).strict().readonly()

export const MarketplaceUpdateStageRequestSchema = z.object({
  currentIdentity: MarketplacePackageArtifactIdentitySchema,
  expectedCurrentRevision: z.number().int().nonnegative(),
}).strict().readonly()

export const MarketplaceUpdateRecordSchema = z.object({
  candidate: InstalledVersionSchema,
  createdAt: TimestampSchema,
  current: InstalledVersionSchema,
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  state: z.enum(['finalized', 'ready', 'rolled-back']),
  updateId: UpdateIdSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  const current = record.current.identity
  const candidate = record.candidate.identity
  if (current.sourceId !== candidate.sourceId
    || current.kind !== candidate.kind
    || current.resourceId !== candidate.resourceId) {
    context.addIssue({ code: 'custom', message: 'Update versions must belong to the same resource' })
  }
  if (current.version === candidate.version) {
    context.addIssue({ code: 'custom', message: 'Update versions must be distinct' })
  }
}).readonly()

export const MarketplaceUpdateBeginRequestSchema = z.object({
  candidate: InstalledVersionSchema,
  current: InstalledVersionSchema,
}).strict().readonly()

export const MarketplaceUpdateTransitionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  state: z.enum(['finalized', 'rolled-back']),
  updateId: UpdateIdSchema,
}).strict().readonly()

export const MarketplaceInstalledUpdateStageRequestSchema = z.object({
  candidateIdentity: MarketplacePackageArtifactIdentitySchema,
  currentIdentity: MarketplacePackageArtifactIdentitySchema,
  expectedCandidateRevision: z.number().int().nonnegative(),
  expectedCurrentRevision: z.number().int().nonnegative(),
}).strict().readonly()

export const MarketplaceUpdateActionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  updateId: UpdateIdSchema,
}).strict().readonly()

export const MarketplaceUpdateCollectionSchema = z.object({
  items: z.array(MarketplaceUpdateRecordSchema).max(1_024).readonly(),
  schemaVersion: z.literal(1),
}).strict().readonly()

export type MarketplaceUpdateStageRequest = z.infer<typeof MarketplaceUpdateStageRequestSchema>
export type MarketplaceUpdateRecord = z.infer<typeof MarketplaceUpdateRecordSchema>
export type MarketplaceUpdateBeginRequest = z.infer<typeof MarketplaceUpdateBeginRequestSchema>
export type MarketplaceUpdateTransitionRequest = z.infer<typeof MarketplaceUpdateTransitionRequestSchema>
export type MarketplaceInstalledUpdateStageRequest = z.infer<typeof MarketplaceInstalledUpdateStageRequestSchema>
export type MarketplaceUpdateActionRequest = z.infer<typeof MarketplaceUpdateActionRequestSchema>
export type MarketplaceUpdateCollection = z.infer<typeof MarketplaceUpdateCollectionSchema>
