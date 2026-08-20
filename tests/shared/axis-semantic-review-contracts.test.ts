import { describe, expect, it } from 'vitest'
import {
  AxisSemanticReviewDecisionSchema,
  AxisSemanticReviewEvidenceSchema,
  AxisSemanticReviewRequestSchema,
  AxisSemanticReviewProposalSchema,
} from '../../src/shared/axis-semantic-review-contracts'

const request = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: 'a'.repeat(64), filePath: 'src/app.ts' }],
  diff: '@@ -1 +1 @@\n-old\n+new',
  diffSha256: 'c'.repeat(64),
  kind: 'correctness' as const,
  objective: 'Keep the behavior correct.',
  requestId: 'review-request-1',
  runId: 'run-1',
  schemaVersion: 1 as const,
  sessionId: 'session-1',
  taskId: 'task-1',
}

const proposal = {
  confidence: 0.9,
  findings: [],
  kind: 'correctness' as const,
  requestId: request.requestId,
  schemaVersion: 1 as const,
  summary: 'No correctness defects found.',
  verdict: 'passed' as const,
}

describe('Axis semantic Reviewer contracts', () => {
  it('strictly validates bounded review requests and untrusted proposals', () => {
    expect(AxisSemanticReviewRequestSchema.parse(request)).toEqual(request)
    expect(AxisSemanticReviewProposalSchema.parse(proposal)).toEqual(proposal)
    expect(AxisSemanticReviewRequestSchema.safeParse({ ...request, workerThoughts: 'secret' }).success).toBe(false)
    expect(AxisSemanticReviewProposalSchema.safeParse({ ...proposal, verdict: 'failed' }).success).toBe(false)
    expect(AxisSemanticReviewProposalSchema.safeParse({
      ...proposal,
      findings: [{
        category: 'security', cvss: null, filePath: 'src/app.ts', line: 1,
        message: 'unsafe', recommendation: 'fix it', severity: 'high',
      }],
      kind: 'security', verdict: 'failed',
    }).success).toBe(false)
  })

  it('binds code-owned decisions and durable evidence to one exact request', () => {
    const decision = AxisSemanticReviewDecisionSchema.parse({
      decidedAt: '2026-08-13T00:00:00.000Z',
      decisionId: 'decision-1',
      kind: request.kind,
      proposal,
      requestId: request.requestId,
      requiredAction: 'none',
      schemaVersion: 1,
      status: 'passed',
    })
    expect(AxisSemanticReviewEvidenceSchema.parse({
      changedFiles: request.changedFiles,
      decision,
      diffSha256: request.diffSha256,
      durationMs: 12,
      evidenceId: 'evidence-1',
      kind: request.kind,
      objectiveSha256: 'd'.repeat(64),
      recordedAt: '2026-08-13T00:00:01.000Z',
      requestId: request.requestId,
      reviewer: { independentFromWorker: true, modelId: 'reviewer-model', providerId: 'provider-1', readOnlyTools: true },
      runId: request.runId,
      schemaVersion: 1,
      sequence: 1,
      sessionId: request.sessionId,
      taskId: request.taskId,
    }).decision).toEqual(decision)
  })
})
