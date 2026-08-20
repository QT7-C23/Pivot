import { describe, expect, it, vi } from 'vitest'
import {
  AxisSemanticReviewCircuitBreaker,
  AxisSemanticReviewerCircuitOpenError,
} from '../../src/main/services/axis-semantic-review-circuit-breaker'
import type { AxisSemanticReviewerPort } from '../../src/main/services/axis-semantic-review-port'
import type { AxisSemanticReviewRequest } from '../../src/shared/axis-semantic-review-contracts'

const request = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: null, filePath: 'src/a.ts' }],
  diff: '+safe', diffSha256: 'c'.repeat(64), kind: 'correctness' as const, objective: 'review',
  requestId: 'request-1', runId: 'run-1', schemaVersion: 1 as const, sessionId: 'session-1', taskId: 'task-1',
} satisfies AxisSemanticReviewRequest

function port(review: AxisSemanticReviewerPort['review']): AxisSemanticReviewerPort {
  return {
    identity: { independentFromWorker: true, modelId: 'review-model', providerId: 'provider', readOnlyTools: true },
    review,
  }
}

describe('AxisSemanticReviewCircuitBreaker', () => {
  it('opens after bounded consecutive failures and avoids provider calls during cooldown', async () => {
    const review = vi.fn(async () => { throw new Error('provider down') })
    const breaker = new AxisSemanticReviewCircuitBreaker(port(review), { cooldownMs: 1_000, failureThreshold: 2, now: () => 100 })
    await expect(breaker.review(request)).rejects.toThrow('provider down')
    await expect(breaker.review(request)).rejects.toThrow('provider down')
    await expect(breaker.review(request)).rejects.toBeInstanceOf(AxisSemanticReviewerCircuitOpenError)
    expect(review).toHaveBeenCalledTimes(2)
    expect(breaker.snapshot()).toMatchObject({ consecutiveFailures: 2, state: 'open' })
  })

  it('permits one half-open probe after cooldown and closes only on success', async () => {
    let now = 100
    const review = vi.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ verdict: 'passed' })
    const breaker = new AxisSemanticReviewCircuitBreaker(port(review), { cooldownMs: 50, failureThreshold: 1, now: () => now })
    await expect(breaker.review(request)).rejects.toThrow('down')
    now = 151
    await expect(breaker.review(request)).resolves.toEqual({ verdict: 'passed' })
    expect(breaker.snapshot()).toEqual({ consecutiveFailures: 0, openedAt: null, state: 'closed' })
  })
})
