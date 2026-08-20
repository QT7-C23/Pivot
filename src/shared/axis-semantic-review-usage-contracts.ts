import { z } from 'zod'
import { AxisSemanticReviewKindSchema } from './axis-semantic-review-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp')

export const AxisSemanticReviewBudgetSnapshotSchema = z.object({
  maxCostUsd: z.number().finite().positive().max(1),
  maxInputTokens: z.number().int().positive().max(200_000),
  maxOutputTokens: z.number().int().positive().max(16_384),
}).strict()

export const AxisSemanticReviewerMeasurementSchema = z.object({
  proposal: z.unknown(),
  reviewer: z.object({
    independentFromWorker: z.literal(true),
    modelId: IdentifierSchema,
    providerId: IdentifierSchema,
    readOnlyTools: z.literal(true),
  }).strict().optional(),
  usage: z.object({
    costUsd: z.number().finite().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export const AxisSemanticReviewUsageEvidenceSchema = z.object({
  budget: AxisSemanticReviewBudgetSnapshotSchema,
  costUsd: z.number().finite().nonnegative(),
  evidenceId: IdentifierSchema,
  inputTokens: z.number().int().nonnegative(),
  kind: AxisSemanticReviewKindSchema,
  modelId: IdentifierSchema,
  outputTokens: z.number().int().nonnegative(),
  providerId: IdentifierSchema,
  recordedAt: TimestampSchema,
  requestId: IdentifierSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  sessionId: IdentifierSchema,
  status: z.enum(['within-budget', 'exceeded']),
  taskId: IdentifierSchema,
}).strict().superRefine((evidence, context) => {
  const exceeded = evidence.costUsd > evidence.budget.maxCostUsd
    || evidence.inputTokens > evidence.budget.maxInputTokens
    || evidence.outputTokens > evidence.budget.maxOutputTokens
  if (exceeded !== (evidence.status === 'exceeded')) {
    context.addIssue({ code: 'custom', message: 'Semantic review usage status must match the immutable budget snapshot', path: ['status'] })
  }
})

export type AxisSemanticReviewUsageEvidence = z.infer<typeof AxisSemanticReviewUsageEvidenceSchema>
export type AxisSemanticReviewerMeasurement = z.infer<typeof AxisSemanticReviewerMeasurementSchema>
