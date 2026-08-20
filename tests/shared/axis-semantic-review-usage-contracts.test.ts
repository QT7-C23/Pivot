import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewUsageEvidenceSchema } from '../../src/shared/axis-semantic-review-usage-contracts'

describe('Axis semantic review usage evidence', () => {
  it('strictly validates measured usage and budget outcome', () => {
    const evidence = {
      budget: { maxCostUsd: 0.01, maxInputTokens: 100, maxOutputTokens: 20 },
      costUsd: 0.002, evidenceId: 'usage-1', inputTokens: 80, kind: 'correctness',
      modelId: 'review-small', outputTokens: 10, providerId: 'provider-review',
      recordedAt: '2026-08-13T00:00:00.000Z', requestId: 'request-1', runId: 'run-1',
      schemaVersion: 1 as const, sequence: 1, sessionId: 'session-1', status: 'within-budget' as const, taskId: 'task-1',
    }
    expect(AxisSemanticReviewUsageEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(AxisSemanticReviewUsageEvidenceSchema.safeParse({ ...evidence, commands: [] }).success).toBe(false)
    expect(AxisSemanticReviewUsageEvidenceSchema.safeParse({ ...evidence, inputTokens: 101 }).success).toBe(false)
    expect(AxisSemanticReviewUsageEvidenceSchema.safeParse({ ...evidence, inputTokens: 101, status: 'exceeded' }).success).toBe(true)
  })
})
