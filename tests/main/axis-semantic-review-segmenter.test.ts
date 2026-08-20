import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewSegmenter } from '../../src/main/services/axis-semantic-review-segmenter'

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

describe('AxisSemanticReviewSegmenter', () => {
  it('deterministically splits and exactly reconstructs large Unicode diffs', () => {
    const diff = `--- a/甲.ts\n+++ b/甲.ts\n${'修改🙂\n'.repeat(30)}tail`
    const segmenter = new AxisSemanticReviewSegmenter({ maxChars: 37 })
    const first = segmenter.segment(diff)
    const second = segmenter.segment(diff)
    expect(first).toEqual(second)
    expect(first.segments.length).toBeGreaterThan(2)
    expect(first.segments.map(({ content }) => content).join('')).toBe(diff)
    expect(first.diffSha256).toBe(sha(diff))
    expect(first.segments.every(({ content }) => content.length <= 37)).toBe(true)
  })

  it('bounds an individual line longer than the segment limit without dropping bytes', () => {
    const diff = 'x'.repeat(101)
    const batch = new AxisSemanticReviewSegmenter({ maxChars: 20 }).segment(diff)
    expect(batch.segments.map(({ content }) => content).join('')).toBe(diff)
    expect(batch.segments).toHaveLength(6)
  })
})
