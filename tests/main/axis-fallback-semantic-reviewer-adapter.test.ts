import { describe, expect, it, vi } from 'vitest'
import { AxisFallbackSemanticReviewerAdapter } from '../../src/main/services/axis-fallback-semantic-reviewer-adapter'
import type { AxisSemanticReviewerPort } from '../../src/main/services/axis-semantic-review-port'
import type { AxisSemanticReviewRequest } from '../../src/shared/axis-semantic-review-contracts'

const request = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: null, filePath: 'src/a.ts' }], diff: '+x',
  diffSha256: 'c'.repeat(64), kind: 'correctness' as const, objective: 'review', requestId: 'r-1', runId: 'run-1',
  schemaVersion: 1 as const, sessionId: 's-1', taskId: 't-1',
} satisfies AxisSemanticReviewRequest

function reviewer(modelId: string, review: AxisSemanticReviewerPort['review']): AxisSemanticReviewerPort {
  return {
    identity: { independentFromWorker: true, modelId, providerId: 'provider-1', readOnlyTools: true },
    route: { maxCostUsd: 0.1, maxInputTokens: 100, maxOutputTokens: 50, modelId, providerId: 'provider-1' },
    review,
  }
}

describe('AxisFallbackSemanticReviewerAdapter', () => {
  it('uses a distinct fallback only after a primary technical failure', async () => {
    const primary = vi.fn(async () => { throw new Error('primary unavailable') })
    const fallback = vi.fn(async () => ({ proposal: { verdict: 'passed' }, usage: { costUsd: 0, inputTokens: 1, outputTokens: 1 } }))
    const pool = new AxisFallbackSemanticReviewerAdapter(reviewer('primary', primary), reviewer('fallback', fallback))
    await expect(pool.review(request)).resolves.toMatchObject({
      proposal: { verdict: 'passed' },
      reviewer: { modelId: 'fallback', providerId: 'provider-1' },
    })
    expect(primary).toHaveBeenCalledOnce()
    expect(fallback).toHaveBeenCalledOnce()
  })

  it('does not ask fallback to override a successful primary response', async () => {
    const primaryResponse = { proposal: { verdict: 'failed' }, usage: { costUsd: 0, inputTokens: 1, outputTokens: 1 } }
    const fallback = vi.fn()
    const pool = new AxisFallbackSemanticReviewerAdapter(reviewer('primary', async () => primaryResponse), reviewer('fallback', fallback))
    await expect(pool.review(request)).resolves.toMatchObject({
      proposal: { verdict: 'failed' }, reviewer: { modelId: 'primary', providerId: 'provider-1' },
    })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('rejects duplicate identities and fails closed when both Reviewers fail', async () => {
    const failing = reviewer('same', async () => { throw new Error('down') })
    expect(() => new AxisFallbackSemanticReviewerAdapter(failing, failing)).toThrow(/distinct/i)
    const pool = new AxisFallbackSemanticReviewerAdapter(failing, reviewer('other', async () => { throw new Error('also down') }))
    await expect(pool.review(request)).rejects.toThrow(/both/i)
  })
})
