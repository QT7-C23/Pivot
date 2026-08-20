import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewerRoutingSchema } from '../../src/shared/axis-semantic-review-routing-contracts'

describe('Axis semantic Reviewer routing contracts', () => {
  it('accepts bounded correctness/security routes and rejects unknown fields', () => {
    const route = {
      correctness: { maxCostUsd: 0.01, maxInputTokens: 20_000, maxOutputTokens: 2_000, modelId: 'review-small', providerId: 'provider-review' },
      schemaVersion: 1 as const,
      security: { maxCostUsd: 0.05, maxInputTokens: 30_000, maxOutputTokens: 3_000, modelId: 'review-strong', providerId: 'provider-review' },
    }
    expect(AxisSemanticReviewerRoutingSchema.parse(route)).toEqual(route)
    expect(AxisSemanticReviewerRoutingSchema.safeParse({ ...route, commands: ['npm test'] }).success).toBe(false)
    expect(AxisSemanticReviewerRoutingSchema.safeParse({ ...route, correctness: { ...route.correctness, maxCostUsd: 100 } }).success).toBe(false)
  })
})
