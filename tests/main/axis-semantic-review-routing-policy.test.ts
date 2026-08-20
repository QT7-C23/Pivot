import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewRoutingPolicy } from '../../src/main/services/axis-semantic-review-routing-policy'

const routing = {
  correctness: { maxCostUsd: 0.01, maxInputTokens: 20_000, maxOutputTokens: 2_000, modelId: 'review-small', providerId: 'provider-review' },
  schemaVersion: 1 as const,
  security: { maxCostUsd: 0.05, maxInputTokens: 30_000, maxOutputTokens: 3_000, modelId: 'review-strong', providerId: 'provider-review' },
}

describe('AxisSemanticReviewRoutingPolicy', () => {
  it('freezes routes that are independent from the Worker and one another', () => {
    const result = new AxisSemanticReviewRoutingPolicy().resolve(routing, { modelId: 'worker-model', providerId: 'provider-worker' })
    expect(result.correctness).toMatchObject({ modelId: 'review-small', providerId: 'provider-review' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.correctness)).toBe(true)
  })

  it('rejects same-model Worker review and same-model correctness/security review', () => {
    const policy = new AxisSemanticReviewRoutingPolicy()
    expect(() => policy.resolve(routing, { modelId: 'review-small', providerId: 'provider-review' })).toThrow(/worker/i)
    expect(() => policy.resolve({ ...routing, security: { ...routing.security, modelId: 'review-small' } }, { modelId: 'worker-model', providerId: 'provider-worker' })).toThrow(/distinct/i)
  })
})
