import { describe, expect, it, vi } from 'vitest'
import { AxisSegmentedSemanticReviewerAdapter } from '../../src/main/services/axis-segmented-semantic-reviewer-adapter'
import type { AxisSemanticReviewRequest } from '../../src/shared/axis-semantic-review-contracts'
import type { AxisSemanticReviewerPort } from '../../src/main/services/axis-semantic-review-port'

const request = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: 'a'.repeat(64), filePath: 'src/a.ts' }],
  diff: 'first line\nsecond line\nthird line', diffSha256: 'c'.repeat(64), kind: 'correctness' as const,
  objective: 'review all segments', requestId: 'request-1', runId: 'run-1', schemaVersion: 1 as const,
  sessionId: 'session-1', taskId: 'task-1',
} satisfies AxisSemanticReviewRequest

function delegate(review: AxisSemanticReviewerPort['review']): AxisSemanticReviewerPort {
  return {
    identity: { independentFromWorker: true, modelId: 'model-1', providerId: 'provider-1', readOnlyTools: true },
    route: { maxCostUsd: 0.1, maxInputTokens: 1_000, maxOutputTokens: 500, modelId: 'model-1', providerId: 'provider-1' },
    review,
  }
}

describe('AxisSegmentedSemanticReviewerAdapter', () => {
  it('reviews every segment and aggregates any failed segment into one measured proposal', async () => {
    const review = vi.fn(async (segment: AxisSemanticReviewRequest) => ({
      proposal: {
        confidence: segment.diff.includes('second') ? 0.8 : 0.95,
        findings: segment.diff.includes('second') ? [{
          category: 'correctness', cvss: null, filePath: 'src/a.ts', line: 2,
          message: 'defect', recommendation: 'fix', severity: 'high',
        }] : [],
        kind: 'correctness', requestId: segment.requestId, schemaVersion: 1,
        summary: segment.diff, verdict: segment.diff.includes('second') ? 'failed' : 'passed',
      },
      usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 2 },
    }))
    const reviewer = new AxisSegmentedSemanticReviewerAdapter(delegate(review), { maxChars: 16 })
    await expect(reviewer.review(request)).resolves.toMatchObject({
      proposal: { confidence: 0.8, findings: [{ message: 'defect' }], requestId: 'request-1', verdict: 'failed' },
      usage: { costUsd: 0.003, inputTokens: 30, outputTokens: 6 },
    })
    expect(review).toHaveBeenCalledTimes(3)
  })

  it('fails closed when any segment returns malformed or mismatched output', async () => {
    const reviewer = new AxisSegmentedSemanticReviewerAdapter(delegate(async () => ({
      proposal: { verdict: 'passed' }, usage: { costUsd: 0, inputTokens: 1, outputTokens: 1 },
    })), { maxChars: 16 })
    await expect(reviewer.review(request)).rejects.toThrow(/segment/i)
  })
})
