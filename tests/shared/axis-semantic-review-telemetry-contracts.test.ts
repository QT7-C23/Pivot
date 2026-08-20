import { describe, expect, it } from 'vitest'
import {
  AxisSemanticReviewTelemetryPageSchema,
  AxisSemanticReviewTelemetryQuerySchema,
} from '../../src/shared/axis-semantic-review-telemetry-contracts'

describe('Axis semantic review telemetry contracts', () => {
  it('accepts a bounded read-only projection without source content or privileged fields', () => {
    const query = AxisSemanticReviewTelemetryQuerySchema.parse({ limit: 20, sessionId: 'session-1' })
    const page = AxisSemanticReviewTelemetryPageSchema.parse({
      available: true,
      items: [{
        durationMs: 12, evidenceId: 'e-1', findingCount: 0, kind: 'correctness',
        recordedAt: '2026-08-13T00:00:00.000Z', requestId: 'q-1', requiredAction: 'none',
        reviewer: { modelId: 'reviewer', providerId: 'provider' }, runId: 'run-1',
        status: 'passed', summary: 'No defect', taskId: 'task-1',
        usage: { costUsd: 0.01, inputTokens: 10, outputTokens: 2, status: 'within-budget' },
      }],
      schemaVersion: 1,
      truncated: false,
      unavailableReason: null,
    })
    expect(query.limit).toBe(20)
    expect(page.items[0]?.status).toBe('passed')
    expect(page.items[0]).not.toHaveProperty('diff')
    expect(page.items[0]).not.toHaveProperty('changedFiles')
  })

  it('rejects unknown fields, oversized queries, secrets and malformed unavailable states', () => {
    expect(AxisSemanticReviewTelemetryQuerySchema.safeParse({ limit: 101, sessionId: 's' }).success).toBe(false)
    expect(AxisSemanticReviewTelemetryQuerySchema.safeParse({ database: {}, limit: 10, sessionId: 's' }).success).toBe(false)
    expect(AxisSemanticReviewTelemetryPageSchema.safeParse({
      available: false, apiKey: 'secret', items: [], schemaVersion: 1, truncated: false, unavailableReason: null,
    }).success).toBe(false)
  })
})
