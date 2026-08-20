import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })

export const AxisPivotFailureObservationSchema = z.object({
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

const AxisPivotFailureEvidenceBaseSchema = z.object({
  evidenceId: IdentifierSchema,
  observedAt: TimestampSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  sourceEventRevision: z.number().int().positive(),
  sourceEventTimestamp: TimestampSchema,
  summary: z.string().trim().min(1).max(4_000),
  taskId: IdentifierSchema,
}).strict()

export const AxisPivotFailureEvidenceSchema = z.discriminatedUnion(
  'schemaVersion',
  [
    AxisPivotFailureEvidenceBaseSchema.extend({
      category: z.literal('minor'),
      schemaVersion: z.literal(1),
    }).strict(),
    AxisPivotFailureEvidenceBaseSchema.extend({
      category: z.literal('direction'),
      retryDecisionId: IdentifierSchema,
      schemaVersion: z.literal(2),
      source: z.literal('post-retry-task-failure'),
    }).strict(),
  ],
).superRefine((evidence, context) => {
  if (evidence.observedAt !== evidence.sourceEventTimestamp) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot failure observation time must match its authoritative source event',
      path: ['observedAt'],
    })
  }
})

export const AxisPivotContinuationHandoffSchema = z.object({
  action: z.enum(['replan', 'retry', 'self-repair', 'dedicated-fixer']),
  createdAt: TimestampSchema,
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  failureEvidenceId: IdentifierSchema,
  handoffId: IdentifierSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.literal('pending-guarded-review'),
  targetRunId: IdentifierSchema,
}).strict()

export type AxisPivotFailureObservation = z.infer<
  typeof AxisPivotFailureObservationSchema
>
export type AxisPivotFailureEvidence = z.infer<
  typeof AxisPivotFailureEvidenceSchema
>
export type AxisPivotContinuationHandoff = z.infer<
  typeof AxisPivotContinuationHandoffSchema
>
