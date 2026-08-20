import { z } from 'zod'

export const AttentionKindSchema = z.enum(['permission', 'runtime'])
export const AttentionSeveritySchema = z.enum(['attention', 'error'])
export const AttentionStatusSchema = z.enum(['open', 'resolved', 'reopened'])

export const AttentionObservationSchema = z.object({
  contextLabel: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(4_000),
  kind: AttentionKindSchema,
  severity: AttentionSeveritySchema,
  sourceId: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(160),
}).strict()

export const AttentionLifecycleRequestSchema = z.object({
  attentionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}).strict()

export const AttentionRecordSchema = AttentionObservationSchema.extend({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
  resolvedAt: z.string().datetime().nullable(),
  revision: z.number().int().positive(),
  schemaVersion: z.literal(1),
  status: AttentionStatusSchema,
  updatedAt: z.string().datetime(),
}).strict().superRefine((record, context) => {
  if (record.status === 'resolved' && record.resolvedAt === null) {
    context.addIssue({ code: 'custom', message: 'resolved Attention requires resolvedAt' })
  }
  if (record.status !== 'resolved' && record.resolvedAt !== null) {
    context.addIssue({ code: 'custom', message: 'active Attention cannot have resolvedAt' })
  }
})

export const AttentionHistorySchema = z.array(AttentionRecordSchema).max(500)

export type AttentionKind = z.infer<typeof AttentionKindSchema>
export type AttentionLifecycleRequest = z.infer<typeof AttentionLifecycleRequestSchema>
export type AttentionObservation = z.infer<typeof AttentionObservationSchema>
export type AttentionRecord = z.infer<typeof AttentionRecordSchema>
export type AttentionSeverity = z.infer<typeof AttentionSeveritySchema>
export type AttentionStatus = z.infer<typeof AttentionStatusSchema>
