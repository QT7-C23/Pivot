import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { AxisSemanticReviewEvidenceRegistry } from '../../src/main/services/axis-semantic-review-evidence-registry'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })))

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-review-evidence-'))
  roots.push(root)
  return path.join(root, 'evidence.db')
}

const input = {
  changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: 'a'.repeat(64), filePath: 'src/app.ts' }],
  decision: {
    decidedAt: '2026-08-13T00:00:00.000Z', decisionId: 'decision-1', kind: 'correctness' as const,
    proposal: { confidence: 0.9, findings: [], kind: 'correctness' as const, requestId: 'request-1', schemaVersion: 1 as const, summary: 'good', verdict: 'passed' as const },
    requestId: 'request-1', requiredAction: 'none' as const, schemaVersion: 1 as const, status: 'passed' as const,
  },
  diffSha256: 'c'.repeat(64), durationMs: 5, kind: 'correctness' as const,
  objectiveSha256: 'd'.repeat(64), requestId: 'request-1',
  reviewer: { independentFromWorker: true as const, modelId: 'review-model', providerId: 'provider-1', readOnlyTools: true as const },
  runId: 'run-1', schemaVersion: 1 as const, sessionId: 'session-1', taskId: 'task-1',
}

describe('AxisSemanticReviewEvidenceRegistry', () => {
  it('persists contiguous strict evidence across restart and scopes task reads', () => {
    const databasePath = fixture()
    let registry = new AxisSemanticReviewEvidenceRegistry(databasePath)
    const first = registry.record(input)
    registry.record({ ...input, kind: 'security', requestId: 'request-2', decision: {
      ...input.decision, decisionId: 'decision-2', kind: 'security', requestId: 'request-2',
      proposal: { ...input.decision.proposal, kind: 'security', requestId: 'request-2' },
    } })
    registry.close()
    registry = new AxisSemanticReviewEvidenceRegistry(databasePath)
    const reader = registry.openReaderPort()
    expect(reader.listForSession('session-1', 1)).toMatchObject({ hasMore: true, items: [{ runId: 'run-1', sequence: 2 }] })
    expect(reader.listForSession('other-session', 10)).toEqual({ hasMore: false, items: [] })
    expect(reader).not.toHaveProperty('record')
    expect(registry.listForRun('run-1').map((entry) => entry.sequence)).toEqual([1, 2])
    expect(registry.listForTask('run-1', 'task-1')[0]?.evidenceId).toBe(first.evidenceId)
    registry.close()
  })

  it('rejects duplicate review identity and corrupted durable JSON', () => {
    const databasePath = fixture()
    const registry = new AxisSemanticReviewEvidenceRegistry(databasePath)
    registry.record(input)
    expect(() => registry.record(input)).toThrow()
    registry.close()
    const db = new Database(databasePath)
    db.prepare('UPDATE axis_semantic_review_evidence SET evidence_json = ?').run('{"forged":true}')
    db.close()
    const reopened = new AxisSemanticReviewEvidenceRegistry(databasePath)
    expect(() => reopened.listForRun('run-1')).toThrow()
    expect(() => reopened.openReaderPort().listForSession('session-1', 10)).toThrow()
    reopened.close()
  })
})
