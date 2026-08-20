import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)

export const AxisSemanticReviewerRouteSchema = z.object({
  maxCostUsd: z.number().finite().positive().max(1),
  maxInputTokens: z.number().int().positive().max(200_000),
  maxOutputTokens: z.number().int().positive().max(16_384),
  modelId: IdentifierSchema,
  providerId: IdentifierSchema,
}).strict()

export const AxisSemanticReviewerRoutingSchema = z.object({
  correctness: AxisSemanticReviewerRouteSchema,
  schemaVersion: z.literal(1),
  security: AxisSemanticReviewerRouteSchema.nullable(),
}).strict()

export const AxisSemanticReviewerWorkerIdentitySchema = z.object({
  modelId: IdentifierSchema,
  providerId: IdentifierSchema,
}).strict()

export type AxisSemanticReviewerRoute = z.infer<typeof AxisSemanticReviewerRouteSchema>
export type AxisSemanticReviewerRouting = z.infer<typeof AxisSemanticReviewerRoutingSchema>
export type AxisSemanticReviewerWorkerIdentity = z.infer<typeof AxisSemanticReviewerWorkerIdentitySchema>
