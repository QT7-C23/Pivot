import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })
const TextSchema = z.string().trim().min(1).max(4_000)

export const AxisHumanEscalationCategorySchema = z.enum([
  'design',
  'excessive',
  'security',
])

const EscalationCreateShape = {
  category: AxisHumanEscalationCategorySchema,
  decisionId: IdentifierSchema,
  evidenceIds: z.array(IdentifierSchema).min(1).max(64),
  executionRevision: z.number().int().positive(),
  reason: TextSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  summary: TextSchema,
  taskId: IdentifierSchema.nullable(),
}

export const AxisHumanEscalationCreateInputSchema = z.object(
  EscalationCreateShape,
).strict().superRefine(requireUniqueEvidence)

export const AxisHumanEscalationReceiptSchema = z.object({
  ...EscalationCreateShape,
  escalationId: IdentifierSchema,
  openedAt: TimestampSchema,
  schemaVersion: z.literal(1),
  status: z.literal('open'),
}).strict().superRefine(requireUniqueEvidence)

export type AxisHumanEscalationCategory = z.infer<
  typeof AxisHumanEscalationCategorySchema
>
export type AxisHumanEscalationCreateInput = z.infer<
  typeof AxisHumanEscalationCreateInputSchema
>
export type AxisHumanEscalationReceipt = z.infer<
  typeof AxisHumanEscalationReceiptSchema
>

function requireUniqueEvidence(
  value: { evidenceIds: string[] },
  context: z.RefinementCtx,
): void {
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Human escalation evidence IDs must be unique',
      path: ['evidenceIds'],
    })
  }
}
