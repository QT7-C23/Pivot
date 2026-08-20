import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisSemanticReviewUsageEvidenceSchema,
  type AxisSemanticReviewUsageEvidence,
} from '../../shared/axis-semantic-review-usage-contracts'

export type AxisSemanticReviewUsageInput = Omit<AxisSemanticReviewUsageEvidence, 'evidenceId' | 'recordedAt' | 'sequence'>

interface UsageRow { evidence_json: string; sequence: number }

export interface AxisSemanticReviewUsagePort {
  record(input: AxisSemanticReviewUsageInput): AxisSemanticReviewUsageEvidence
}

export interface AxisSemanticReviewUsageReaderPort {
  listForSession(sessionId: string, limit: number): { hasMore: boolean; items: AxisSemanticReviewUsageEvidence[] }
}

export class AxisSemanticReviewUsageRegistry implements AxisSemanticReviewUsagePort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_semantic_review_usage (
        evidence_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        sequence INTEGER NOT NULL,
        evidence_json TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_semantic_review_usage_run
        ON axis_semantic_review_usage(run_id, sequence ASC);
    `)
  }

  record(input: AxisSemanticReviewUsageInput): AxisSemanticReviewUsageEvidence {
    return this.db.transaction(() => {
      const sequence = ((this.db.prepare('SELECT MAX(sequence) AS value FROM axis_semantic_review_usage WHERE run_id = ?')
        .get(input.runId) as { value: number | null }).value ?? 0) + 1
      const evidence = AxisSemanticReviewUsageEvidenceSchema.parse({
        ...input,
        evidenceId: `axis-semantic-usage-${randomUUID()}`,
        recordedAt: new Date().toISOString(),
        sequence,
      })
      this.db.prepare(`INSERT INTO axis_semantic_review_usage
        (evidence_id, run_id, request_id, sequence, evidence_json) VALUES (?, ?, ?, ?, ?)`)
        .run(evidence.evidenceId, evidence.runId, evidence.requestId, evidence.sequence, JSON.stringify(evidence))
      return evidence
    })()
  }

  listForRun(runId: string): AxisSemanticReviewUsageEvidence[] {
    return (this.db.prepare(`SELECT sequence, evidence_json FROM axis_semantic_review_usage
      WHERE run_id = ? ORDER BY sequence ASC`).all(runId) as UsageRow[]).map((row, index) => {
      const evidence = AxisSemanticReviewUsageEvidenceSchema.parse(JSON.parse(row.evidence_json) as unknown)
      if (row.sequence !== index + 1 || evidence.sequence !== row.sequence) throw new Error(`Axis semantic review usage sequence mismatch: ${runId}`)
      return evidence
    })
  }

  openReaderPort(): AxisSemanticReviewUsageReaderPort {
    return Object.freeze({
      listForSession: (sessionId: string, limit: number) => this.listForSession(sessionId, limit),
    })
  }

  private listForSession(sessionId: string, limit: number): { hasMore: boolean; items: AxisSemanticReviewUsageEvidence[] } {
    assertReadLimit(limit)
    const rows = this.db.prepare(`SELECT sequence, evidence_json FROM axis_semantic_review_usage
      WHERE json_extract(evidence_json, '$.sessionId') = ? ORDER BY rowid DESC LIMIT ?`)
      .all(sessionId, limit + 1) as UsageRow[]
    return { hasMore: rows.length > limit, items: rows.slice(0, limit).map(parseUsageRow) }
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare("DELETE FROM axis_semantic_review_usage WHERE json_extract(evidence_json, '$.sessionId') = ?")
      .run(sessionId).changes
  }

  close(): void { this.db.close() }
}

function parseUsageRow(row: UsageRow): AxisSemanticReviewUsageEvidence {
  const evidence = AxisSemanticReviewUsageEvidenceSchema.parse(JSON.parse(row.evidence_json) as unknown)
  if (evidence.sequence !== row.sequence) throw new Error(`Axis semantic review usage sequence mismatch: ${evidence.evidenceId}`)
  return evidence
}

function assertReadLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Semantic review usage read limit must be from 1 to 100')
}
