import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const ProjectRootSchema = z.string().trim().min(1).max(1_024)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)

export const AxisProjectBindRequestSchema = z.object({
  projectRoot: ProjectRootSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisProjectBindingSchema = AxisProjectBindRequestSchema.extend({
  boundAt: TimestampSchema,
  projectId: IdentifierSchema,
  schemaVersion: z.literal(1),
}).strict()

const AxisRunLeaseCleanupRequestSchema = z.object({
  reason: z.enum(['aborted', 'cancelled', 'completed', 'failed']),
  runId: IdentifierSchema,
  scope: z.literal('run'),
  sessionId: IdentifierSchema,
}).strict()

const AxisSessionLeaseCleanupRequestSchema = z.object({
  reason: z.enum(['session-closed', 'session-deleted', 'shutdown']),
  scope: z.literal('session'),
  sessionId: IdentifierSchema,
}).strict()

export const AxisLeaseCleanupRequestSchema = z.discriminatedUnion('scope', [
  AxisRunLeaseCleanupRequestSchema,
  AxisSessionLeaseCleanupRequestSchema,
])

const AxisLeaseCleanupReceiptBaseSchema = z.object({
  cleanedAt: TimestampSchema,
  releasedLeaseCount: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
})

export const AxisLeaseCleanupReceiptSchema = z.discriminatedUnion('scope', [
  AxisLeaseCleanupReceiptBaseSchema.extend({
    reason: AxisRunLeaseCleanupRequestSchema.shape.reason,
    runId: IdentifierSchema,
    scope: z.literal('run'),
  }).strict(),
  AxisLeaseCleanupReceiptBaseSchema.extend({
    reason: AxisSessionLeaseCleanupRequestSchema.shape.reason,
    runId: z.null(),
    scope: z.literal('session'),
  }).strict(),
])

export type AxisProjectBindRequest = z.infer<typeof AxisProjectBindRequestSchema>
export type AxisProjectBinding = z.infer<typeof AxisProjectBindingSchema>
export type AxisLeaseCleanupRequest = z.infer<typeof AxisLeaseCleanupRequestSchema>
export type AxisLeaseCleanupReceipt = z.infer<typeof AxisLeaseCleanupReceiptSchema>
