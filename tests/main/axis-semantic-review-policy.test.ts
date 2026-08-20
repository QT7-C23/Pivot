import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewPolicy } from '../../src/main/services/axis-semantic-review-policy'

const request = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: 'a'.repeat(64), filePath: 'src/auth.ts' }],
  diff: '+secure()', diffSha256: 'c'.repeat(64), kind: 'security' as const,
  objective: 'Secure authentication.', requestId: 'request-1', runId: 'run-1',
  schemaVersion: 1 as const, sessionId: 'session-1', taskId: 'task-1',
}

describe('AxisSemanticReviewPolicy', () => {
  it('accepts only a high-confidence matching passed proposal', () => {
    const decision = new AxisSemanticReviewPolicy().decide(request, {
      confidence: 0.9, findings: [], kind: 'security', requestId: 'request-1',
      schemaVersion: 1, summary: 'No vulnerability found.', verdict: 'passed',
    }, '2026-08-13T00:00:00.000Z')
    expect(decision).toMatchObject({ requiredAction: 'none', status: 'passed' })
  })

  it('fails closed on malformed, stale, low-confidence and negative proposals', () => {
    const policy = new AxisSemanticReviewPolicy()
    expect(policy.decide(request, { verdict: 'passed' }, '2026-08-13T00:00:00.000Z')).toMatchObject({ requiredAction: 'human-review', status: 'unavailable' })
    expect(policy.decide(request, {
      confidence: 0.9, findings: [], kind: 'security', requestId: 'stale', schemaVersion: 1,
      summary: 'stale', verdict: 'passed',
    }, '2026-08-13T00:00:00.000Z')).toMatchObject({ requiredAction: 'human-review', status: 'disputed' })
    expect(policy.decide(request, {
      confidence: 0.69, findings: [], kind: 'security', requestId: 'request-1', schemaVersion: 1,
      summary: 'uncertain', verdict: 'passed',
    }, '2026-08-13T00:00:00.000Z')).toMatchObject({ requiredAction: 'human-review', status: 'disputed' })
    expect(policy.decide(request, {
      confidence: 0.9,
      findings: [{ category: 'security', cvss: 8.1, filePath: 'src/auth.ts', line: 1, message: 'bypass', recommendation: 'validate', severity: 'high' }],
      kind: 'security', requestId: 'request-1', schemaVersion: 1, summary: 'vulnerable', verdict: 'failed',
    }, '2026-08-13T00:00:00.000Z')).toMatchObject({ requiredAction: 'dedicated-fixer', status: 'failed' })
  })
})
