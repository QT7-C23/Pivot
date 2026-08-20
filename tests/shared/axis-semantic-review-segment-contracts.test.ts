import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewSegmentBatchSchema } from '../../src/shared/axis-semantic-review-segment-contracts'

describe('Axis semantic review segment contracts', () => {
  it('accepts only contiguous, complete and bounded segment batches', () => {
    const batch = {
      diffSha256: 'a'.repeat(64), schemaVersion: 1 as const,
      segments: [
        { content: 'one\n', contentSha256: 'b'.repeat(64), index: 0, schemaVersion: 1 as const },
        { content: 'two', contentSha256: 'c'.repeat(64), index: 1, schemaVersion: 1 as const },
      ],
    }
    expect(AxisSemanticReviewSegmentBatchSchema.parse(batch)).toEqual(batch)
    expect(AxisSemanticReviewSegmentBatchSchema.safeParse({ ...batch, segments: [batch.segments[1]] }).success).toBe(false)
    expect(AxisSemanticReviewSegmentBatchSchema.safeParse({ ...batch, commands: [] }).success).toBe(false)
  })
})
