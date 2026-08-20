import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewCoordinator } from '../../src/main/services/axis-semantic-review-coordinator'
import type { AxisSemanticReviewEvidenceInput } from '../../src/main/services/axis-semantic-review-evidence-registry'
import type { AxisSemanticReviewerPort } from '../../src/main/services/axis-semantic-review-port'
import type { AxisSemanticReviewUsageInput } from '../../src/main/services/axis-semantic-review-usage-registry'

const base = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: 'a'.repeat(64), filePath: 'src/auth.ts' }],
  diff: '+secure()', diffSha256: 'c'.repeat(64), objective: 'Secure authentication.',
  runId: 'run-1', sessionId: 'session-1', taskId: 'task-1',
}

function reviewer(kind: 'correctness' | 'security', verdict: 'passed' | 'failed'): AxisSemanticReviewerPort {
  return {
    identity: { independentFromWorker: true, modelId: `${kind}-model`, providerId: 'provider-1', readOnlyTools: true },
    async review(request) {
      return {
        confidence: 0.9,
        findings: verdict === 'passed' ? [] : [{
          category: kind, cvss: kind === 'security' ? 8.2 : null, filePath: 'src/auth.ts',
          line: 1, message: 'defect', recommendation: 'fix', severity: 'high',
        }],
        kind, requestId: request.requestId, schemaVersion: 1, summary: verdict, verdict,
      }
    },
  }
}

describe('AxisSemanticReviewCoordinator', () => {
  it('audits the actual selected fallback identity in decision and usage evidence', async () => {
    const recorded: AxisSemanticReviewEvidenceInput[] = []
    const usage: AxisSemanticReviewUsageInput[] = []
    const baseReviewer = reviewer('correctness', 'passed')
    await new AxisSemanticReviewCoordinator({
      correctness: {
        ...baseReviewer,
        route: { maxCostUsd: 0.1, maxInputTokens: 100, maxOutputTokens: 20, modelId: 'primary', providerId: 'provider-1' },
        async review(request) {
          return {
            proposal: await baseReviewer.review(request),
            reviewer: { independentFromWorker: true, modelId: 'fallback', providerId: 'provider-2', readOnlyTools: true },
            usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 2 },
          }
        },
      },
      evidence: { record: (entry) => (recorded.push(entry), { ...entry, evidenceId: 'e-selected', recordedAt: new Date().toISOString(), sequence: 1 }) },
      usage: { record: (entry) => (usage.push(entry), { ...entry, evidenceId: 'u-selected', recordedAt: new Date().toISOString(), sequence: 1 }) },
    }).review({ ...base, requireSecurity: false })
    expect(recorded[0]?.reviewer).toMatchObject({ modelId: 'fallback', providerId: 'provider-2' })
    expect(usage[0]).toMatchObject({ modelId: 'fallback', providerId: 'provider-2' })
  })

  it('fails closed when a Reviewer finding points outside the exact after-file line map', async () => {
    const result = await new AxisSemanticReviewCoordinator({
      correctness: reviewer('correctness', 'failed'),
      evidence: { record: (entry) => ({ ...entry, evidenceId: 'e-line', recordedAt: new Date().toISOString(), sequence: 1 }) },
    }).review({ ...base, afterFileLineCounts: { 'src/auth.ts': 0 }, requireSecurity: false })
    expect(result).toMatchObject({ requiredAction: 'human-review', status: 'unavailable' })
  })

  it('fails closed and durably records usage when a measured reviewer exceeds route budget', async () => {
    const usage: AxisSemanticReviewUsageInput[] = []
    const correctness = reviewer('correctness', 'passed')
    const result = await new AxisSemanticReviewCoordinator({
      correctness: {
        ...correctness,
        route: { maxCostUsd: 0.01, maxInputTokens: 100, maxOutputTokens: 20, modelId: 'correctness-model', providerId: 'provider-1' },
        review: async (request) => ({ proposal: await correctness.review(request), usage: { costUsd: 0.02, inputTokens: 101, outputTokens: 10 } }),
      },
      evidence: { record: (entry) => ({ ...entry, evidenceId: 'e-1', recordedAt: new Date().toISOString(), sequence: 1 }) },
      usage: { record: (entry) => (usage.push(entry), { ...entry, evidenceId: 'u-1', recordedAt: new Date().toISOString(), sequence: 1 }) },
    }).review({ ...base, requireSecurity: false })
    expect(result).toMatchObject({ requiredAction: 'human-review', status: 'unavailable' })
    expect(usage).toMatchObject([{ inputTokens: 101, status: 'exceeded' }])
  })

  it('runs correctness before conditional security and persists both decisions', async () => {
    const recorded: AxisSemanticReviewEvidenceInput[] = []
    const result = await new AxisSemanticReviewCoordinator({
      correctness: reviewer('correctness', 'passed'), evidence: { record: (entry) => (recorded.push(entry), { ...entry, evidenceId: `e-${recorded.length}`, recordedAt: new Date().toISOString(), sequence: recorded.length }) },
      security: reviewer('security', 'passed'), timeoutMs: 100,
    }).review({ ...base, requireSecurity: true })
    expect(result.status).toBe('passed')
    expect(recorded.map((entry) => entry.kind)).toEqual(['correctness', 'security'])
  })

  it('stops before security when correctness fails', async () => {
    let securityCalls = 0
    const security = reviewer('security', 'passed')
    const result = await new AxisSemanticReviewCoordinator({
      correctness: reviewer('correctness', 'failed'), evidence: { record: (entry) => ({ ...entry, evidenceId: 'e-1', recordedAt: new Date().toISOString(), sequence: 1 }) },
      security: { ...security, review: async (...args) => { securityCalls += 1; return security.review(...args) } }, timeoutMs: 100,
    }).review({ ...base, requireSecurity: true })
    expect(result).toMatchObject({ requiredAction: 'retry', status: 'failed' })
    expect(securityCalls).toBe(0)
  })

  it('fails closed when a reviewer is unavailable or times out', async () => {
    const result = await new AxisSemanticReviewCoordinator({
      correctness: { ...reviewer('correctness', 'passed'), review: async () => new Promise(() => undefined) },
      evidence: { record: (entry) => ({ ...entry, evidenceId: 'e-1', recordedAt: new Date().toISOString(), sequence: 1 }) },
      timeoutMs: 5,
    }).review({ ...base, requireSecurity: false })
    expect(result).toMatchObject({ requiredAction: 'human-review', status: 'unavailable' })
  })
})
