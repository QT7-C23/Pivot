import { createHash } from 'node:crypto'
import {
  AxisSemanticReviewSegmentBatchSchema,
  type AxisSemanticReviewSegmentBatch,
} from '../../shared/axis-semantic-review-segment-contracts'

export interface AxisSemanticReviewSegmentPort {
  segment(diff: string): AxisSemanticReviewSegmentBatch
}

export class AxisSemanticReviewSegmenter implements AxisSemanticReviewSegmentPort {
  private readonly maxChars: number

  constructor(options: { maxChars?: number } = {}) {
    this.maxChars = options.maxChars ?? 60_000
    if (!Number.isInteger(this.maxChars) || this.maxChars < 16 || this.maxChars > 100_000) {
      throw new Error('Semantic review segment maxChars must be an integer from 16 to 100000')
    }
  }

  segment(diff: string): AxisSemanticReviewSegmentBatch {
    if (!diff) throw new Error('Semantic review diff must not be empty')
    const contents: string[] = []
    let offset = 0
    while (offset < diff.length) {
      const hardEnd = Math.min(diff.length, offset + this.maxChars)
      let end = hardEnd
      if (hardEnd < diff.length) {
        const newline = diff.lastIndexOf('\n', hardEnd - 1)
        if (newline >= offset) end = newline + 1
      }
      if (end <= offset) end = hardEnd
      contents.push(diff.slice(offset, end))
      offset = end
    }
    return AxisSemanticReviewSegmentBatchSchema.parse({
      diffSha256: sha256(diff),
      schemaVersion: 1,
      segments: contents.map((content, index) => ({
        content,
        contentSha256: sha256(content),
        index,
        schemaVersion: 1,
      })),
    })
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
