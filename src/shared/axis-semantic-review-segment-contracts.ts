import { z } from 'zod'

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const AxisSemanticReviewSegmentSchema = z.object({
  content: z.string().min(1).max(100_000),
  contentSha256: Sha256Schema,
  index: z.number().int().nonnegative().max(4_999),
  schemaVersion: z.literal(1),
}).strict()

export const AxisSemanticReviewSegmentBatchSchema = z.object({
  diffSha256: Sha256Schema,
  schemaVersion: z.literal(1),
  segments: z.array(AxisSemanticReviewSegmentSchema).min(1).max(5_000),
}).strict().superRefine((batch, context) => {
  batch.segments.forEach((segment, index) => {
    if (segment.index !== index) {
      context.addIssue({ code: 'custom', message: 'Semantic review segment indexes must be contiguous', path: ['segments', index, 'index'] })
    }
  })
})

export type AxisSemanticReviewSegment = z.infer<typeof AxisSemanticReviewSegmentSchema>
export type AxisSemanticReviewSegmentBatch = z.infer<typeof AxisSemanticReviewSegmentBatchSchema>
