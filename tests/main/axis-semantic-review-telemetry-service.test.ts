import { describe, expect, it, vi } from 'vitest'
import { AxisSemanticReviewTelemetryService } from '../../src/main/services/axis-semantic-review-telemetry-service'

const decisionEvidence = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: null, filePath: 'secret.ts' }],
  decision: { decidedAt: '2026-08-13T00:00:00.000Z', decisionId: 'd-1', kind: 'correctness' as const,
    proposal: { confidence: 0.9, findings: [], kind: 'correctness' as const, requestId: 'q-1', schemaVersion: 1 as const, summary: 'Clean', verdict: 'passed' as const },
    requestId: 'q-1', requiredAction: 'none' as const, schemaVersion: 1 as const, status: 'passed' as const },
  diffSha256: 'c'.repeat(64), durationMs: 5, evidenceId: 'e-1', kind: 'correctness' as const,
  objectiveSha256: 'd'.repeat(64), recordedAt: '2026-08-13T00:00:00.000Z', requestId: 'q-1',
  reviewer: { independentFromWorker: true as const, modelId: 'review', providerId: 'provider', readOnlyTools: true as const },
  runId: 'run-1', schemaVersion: 1 as const, sequence: 1, sessionId: 'session-1', taskId: 'task-1',
}

describe('AxisSemanticReviewTelemetryService', () => {
  it('joins decision and usage by request identity into a bounded redacted projection', () => {
    const decisions = { listForSession: vi.fn(() => ({ hasMore: true, items: [decisionEvidence] })) }
    const usage = { listForSession: vi.fn(() => ({ hasMore: false, items: [{
      budget: { maxCostUsd: 1, maxInputTokens: 10, maxOutputTokens: 10 }, costUsd: 0.01, evidenceId: 'u-1',
      inputTokens: 4, kind: 'correctness' as const, modelId: 'review', outputTokens: 2, providerId: 'provider',
      recordedAt: '2026-08-13T00:00:00.000Z', requestId: 'q-1', runId: 'run-1', schemaVersion: 1 as const,
      sequence: 1, sessionId: 'session-1', status: 'within-budget' as const, taskId: 'task-1',
    }] })) }
    const page = new AxisSemanticReviewTelemetryService({ decisions, usage }).list({ limit: 10, sessionId: 'session-1' })
    expect(page).toMatchObject({ available: true, items: [{ summary: 'Clean', usage: { inputTokens: 4 } }], truncated: true })
    expect(page.items[0]).not.toHaveProperty('changedFiles')
    expect(decisions.listForSession).toHaveBeenCalledWith('session-1', 10)
  })

  it('fails closed on usage ownership mismatch and represents disabled capability explicitly', () => {
    const mismatched = { ...decisionEvidence, sessionId: 'other' }
    expect(() => new AxisSemanticReviewTelemetryService({
      decisions: { listForSession: () => ({ hasMore: false, items: [mismatched] }) },
      usage: { listForSession: () => ({ hasMore: false, items: [] }) },
    }).list({ limit: 10, sessionId: 'session-1' })).toThrow(/ownership/i)
    expect(AxisSemanticReviewTelemetryService.unavailable('disabled')).toEqual({
      available: false, items: [], schemaVersion: 1, truncated: false, unavailableReason: 'disabled',
    })
  })
})
