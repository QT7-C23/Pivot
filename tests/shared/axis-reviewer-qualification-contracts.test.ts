import { describe, expect, it } from 'vitest'
import {
  AxisReviewerQualificationEvidenceSchema,
  AxisReviewerQualificationRequestSchema,
  AxisReviewerRoutingConfigSchema,
  AxisReviewerRoutingUpdateSchema,
} from '../../src/shared/axis-reviewer-qualification-contracts'

describe('Axis Reviewer qualification contracts', () => {
  it('accepts bounded qualification evidence and revisioned routing', () => {
    expect(AxisReviewerQualificationRequestSchema.parse({ modelId: 'review', providerId: 'p1' }))
      .toEqual({ modelId: 'review', providerId: 'p1' })
    expect(AxisReviewerQualificationEvidenceSchema.parse(evidence()).qualified).toBe(true)
    expect(AxisReviewerRoutingConfigSchema.parse(config()).revision).toBe(1)
    expect(AxisReviewerRoutingUpdateSchema.parse({ expectedRevision: 1, routing: config().routing }).expectedRevision).toBe(1)
  })

  it('rejects secrets, tools, invalid budgets and incoherent enabled routes', () => {
    expect(AxisReviewerQualificationRequestSchema.safeParse({ apiKey: 'secret', modelId: 'review', providerId: 'p1' }).success).toBe(false)
    expect(AxisReviewerQualificationEvidenceSchema.safeParse({ ...evidence(), tools: ['fs'] }).success).toBe(false)
    expect(AxisReviewerQualificationEvidenceSchema.safeParse({ ...evidence(), usage: { costUsd: 1, inputTokens: 2, outputTokens: 2 } }).success).toBe(false)
    expect(AxisReviewerRoutingConfigSchema.safeParse({ ...config(), routing: { ...config().routing, correctness: null } }).success).toBe(false)
    expect(AxisReviewerRoutingConfigSchema.safeParse({ ...config(), routing: { ...config().routing,
      security: { modelId: 'security', providerId: 'p2' } } }).success).toBe(false)
  })
})

function evidence() {
  return {
    evidenceId: 'qualification-1', expiresAt: '2026-08-15T00:00:00.000Z', modelId: 'review',
    providerId: 'p1', providerRevision: '2026-08-14T00:00:00.000Z', qualified: true,
    qualifiedAt: '2026-08-14T00:00:00.000Z', schemaVersion: 1,
    usage: { costUsd: 0.001, inputTokens: 20, outputTokens: 10 },
  }
}

function config() {
  return {
    revision: 1, routing: { correctness: { modelId: 'review', providerId: 'p1' }, enabled: true,
      security: null, correctnessFallback: null, securityFallback: null }, schemaVersion: 1,
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
}
