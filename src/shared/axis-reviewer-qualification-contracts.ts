import { z } from 'zod'

const Id = z.string().trim().min(1).max(160)
const Timestamp = z.string().datetime({ offset: true })
const Identity = z.object({ modelId: Id, providerId: Id }).strict()

export const AxisReviewerQualificationRequestSchema = z.object({ modelId: Id, providerId: Id }).strict()

export const AxisReviewerQualificationEvidenceSchema = z.object({
  evidenceId: Id,
  expiresAt: Timestamp,
  modelId: Id,
  providerId: Id,
  providerRevision: Timestamp,
  qualified: z.literal(true),
  qualifiedAt: Timestamp,
  schemaVersion: z.literal(1),
  usage: z.object({
    costUsd: z.number().finite().nonnegative().max(0.01),
    inputTokens: z.number().int().nonnegative().max(512),
    outputTokens: z.number().int().nonnegative().max(128),
  }).strict(),
}).strict()

export const AxisReviewerRoutingSchema = z.object({
  correctness: Identity.nullable(),
  correctnessFallback: Identity.nullable(),
  enabled: z.boolean(),
  security: Identity.nullable(),
  securityFallback: Identity.nullable(),
}).strict().superRefine((value, context) => {
  if (value.enabled && !value.correctness) context.addIssue({ code: 'custom', message: 'enabled routing requires correctness Reviewer' })
  if (value.securityFallback && !value.security) context.addIssue({ code: 'custom', message: 'security fallback requires security Reviewer' })
  const keys = [value.correctness, value.security, value.correctnessFallback, value.securityFallback]
    .filter((item): item is z.infer<typeof Identity> => Boolean(item)).map((item) => `${item.providerId}:${item.modelId}`)
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Reviewer identities must be independent' })
  const providers = [value.correctness, value.security, value.correctnessFallback, value.securityFallback]
    .filter((item): item is z.infer<typeof Identity> => Boolean(item)).map((item) => item.providerId)
  if (new Set(providers).size > 1) context.addIssue({ code: 'custom', message: 'current Reviewer runtime requires one Provider' })
})

export const AxisReviewerRoutingConfigSchema = z.object({
  revision: z.number().int().nonnegative(),
  routing: AxisReviewerRoutingSchema,
  schemaVersion: z.literal(1),
  updatedAt: Timestamp,
}).strict()

export const AxisReviewerRoutingUpdateSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  routing: AxisReviewerRoutingSchema,
}).strict()

export type AxisReviewerQualificationRequest = z.infer<typeof AxisReviewerQualificationRequestSchema>
export type AxisReviewerQualificationEvidence = z.infer<typeof AxisReviewerQualificationEvidenceSchema>
export type AxisReviewerRouting = z.infer<typeof AxisReviewerRoutingSchema>
export type AxisReviewerRoutingConfig = z.infer<typeof AxisReviewerRoutingConfigSchema>
export type AxisReviewerRoutingUpdate = z.infer<typeof AxisReviewerRoutingUpdateSchema>
