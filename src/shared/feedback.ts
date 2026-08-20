import { z } from 'zod'

export const FeedbackTypeSchema = z.enum([
  'bug-report',
  'feature-request',
  'improvement',
  'other',
])

export const FeedbackPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const FeedbackAttachmentSchema = z.object({
  byteLength: z.number().int().nonnegative().max(10 * 1024 * 1024),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(255).refine(
    (value) => !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..',
    'expected a plain attachment file name',
  ),
}).strict()

export const FeedbackAttachmentDiscardRequestSchema = z.object({
  attachmentId: z.string().uuid(),
}).strict()

export const FeedbackSubmissionRequestSchema = z.object({
  attachmentIds: z.array(z.string().uuid()).max(5).refine(
    (value) => new Set(value).size === value.length,
    'expected unique feedback attachment ids',
  ),
  description: z.string().trim().min(1).max(10_000),
  priority: FeedbackPrioritySchema,
  submissionId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  type: FeedbackTypeSchema,
}).strict()

export const FeedbackRecordSchema = FeedbackSubmissionRequestSchema.extend({
  attachments: z.array(FeedbackAttachmentSchema).max(5),
  createdAt: z.string().datetime(),
  schemaVersion: z.literal(1),
  status: z.literal('saved-locally'),
}).strict().superRefine((record, context) => {
  if (record.attachments.length !== record.attachmentIds.length) {
    context.addIssue({ code: 'custom', message: 'feedback attachment metadata does not match ids' })
    return
  }
  record.attachmentIds.forEach((id, index) => {
    if (record.attachments[index]?.id !== id) {
      context.addIssue({ code: 'custom', message: 'feedback attachment order does not match ids' })
    }
  })
})

export const FeedbackHistorySchema = z.array(FeedbackRecordSchema).max(500)

export type FeedbackAttachment = z.infer<typeof FeedbackAttachmentSchema>
export type FeedbackAttachmentDiscardRequest = z.infer<typeof FeedbackAttachmentDiscardRequestSchema>
export type FeedbackPriority = z.infer<typeof FeedbackPrioritySchema>
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>
export type FeedbackSubmissionRequest = z.infer<typeof FeedbackSubmissionRequestSchema>
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>
