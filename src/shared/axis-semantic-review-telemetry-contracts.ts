import { z } from 'zod'
import { AxisSemanticReviewKindSchema } from './axis-semantic-review-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp')

export const AxisSemanticReviewTelemetryQuerySchema = z.object({
  limit: z.number().int().positive().max(100).default(50),
  sessionId: IdentifierSchema,
}).strict()

export const AxisSemanticReviewTelemetryItemSchema = z.object({
  durationMs: z.number().int().nonnegative().max(600_000),
  evidenceId: IdentifierSchema,
  findingCount: z.number().int().nonnegative().max(64),
  kind: AxisSemanticReviewKindSchema,
  recordedAt: TimestampSchema,
  requestId: IdentifierSchema,
  requiredAction: z.enum(['none', 'retry', 'dedicated-fixer', 'human-review']),
  reviewer: z.object({ modelId: IdentifierSchema, providerId: IdentifierSchema }).strict(),
  runId: IdentifierSchema,
  status: z.enum(['passed', 'failed', 'unavailable', 'disputed']),
  summary: z.string().trim().min(1).max(8_000),
  taskId: IdentifierSchema,
  usage: z.object({
    costUsd: z.number().finite().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    status: z.enum(['within-budget', 'exceeded']),
  }).strict().nullable(),
}).strict()

export const AxisSemanticReviewTelemetryPageSchema = z.object({
  available: z.boolean(),
  items: z.array(AxisSemanticReviewTelemetryItemSchema).max(100),
  schemaVersion: z.literal(1),
  truncated: z.boolean(),
  unavailableReason: z.enum(['disabled', 'not-configured']).nullable(),
}).strict().superRefine((page, context) => {
  if (page.available === (page.unavailableReason !== null)) {
    context.addIssue({ code: 'custom', message: 'Telemetry availability must match unavailableReason', path: ['unavailableReason'] })
  }
  if (!page.available && (page.items.length > 0 || page.truncated)) {
    context.addIssue({ code: 'custom', message: 'Unavailable telemetry cannot contain items or truncation' })
  }
})

export type AxisSemanticReviewTelemetryQuery = z.infer<typeof AxisSemanticReviewTelemetryQuerySchema>
export type AxisSemanticReviewTelemetryItem = z.infer<typeof AxisSemanticReviewTelemetryItemSchema>
export type AxisSemanticReviewTelemetryPage = z.infer<typeof AxisSemanticReviewTelemetryPageSchema>
