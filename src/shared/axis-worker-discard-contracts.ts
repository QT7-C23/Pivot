import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })
const ReasonSchema = z.string().trim().min(1).max(4_000)

const DiscardCreateShape = {
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  reason: ReasonSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  sourceAttempt: z.number().int().positive(),
  sourceAttemptId: IdentifierSchema,
  sourceWorkerId: IdentifierSchema,
  taskId: IdentifierSchema,
}

export const AxisWorkerDiscardCreateInputSchema = z.object(
  DiscardCreateShape,
).strict()

export const AxisWorkerDiscardReceiptSchema = z.object({
  ...DiscardCreateShape,
  createdAt: TimestampSchema,
  discardId: IdentifierSchema,
  schemaVersion: z.literal(1),
  status: z.literal('discarded'),
}).strict()

export type AxisWorkerDiscardCreateInput = z.infer<
  typeof AxisWorkerDiscardCreateInputSchema
>
export type AxisWorkerDiscardReceipt = z.infer<
  typeof AxisWorkerDiscardReceiptSchema
>
