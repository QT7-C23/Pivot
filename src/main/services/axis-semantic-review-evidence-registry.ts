import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisSemanticReviewEvidenceSchema,
  type AxisSemanticReviewEvidence,
} from '../../shared/axis-semantic-review-contracts'

export type AxisSemanticReviewEvidenceInput = Omit<AxisSemanticReviewEvidence, 'evidenceId' | 'recordedAt' | 'sequence'>

interface EvidenceRow { evidence_json: string; sequence: number }

export interface AxisSemanticReviewEvidencePort {
  record(input: AxisSemanticReviewEvidenceInput): AxisSemanticReviewEvidence
}

export interface AxisSemanticReviewEvidenceReaderPort {
  listForSession(sessionId: string, limit: number): { hasMore: boolean; items: AxisSemanticReviewEvidence[] }
}

export class AxisSemanticReviewEvidenceRegistry implements AxisSemanticReviewEvidencePort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_semantic_review_evidence (
        evidence_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        evidence_json TEXT NOT NULL,
        UNIQUE(run_id, task_id, request_id, kind),
        UNIQUE(run_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_semantic_review_run
        ON axis_semantic_review_evidence(run_id, sequence ASC);
      CREATE INDEX IF NOT EXISTS idx_axis_semantic_review_task
        ON axis_semantic_review_evidence(run_id, task_id, sequence ASC);
    `)
  }

  record(input: AxisSemanticReviewEvidenceInput): AxisSemanticReviewEvidence {
    return this.db.transaction(() => {
      const sequence = ((this.db.prepare(
        'SELECT MAX(sequence) AS value FROM axis_semantic_review_evidence WHERE run_id = ?',
      ).get(input.runId) as { value: number | null }).value ?? 0) + 1
      const evidence = AxisSemanticReviewEvidenceSchema.parse({
        ...input,
        evidenceId: `axis-semantic-review-${randomUUID()}`,
        recordedAt: new Date().toISOString(),
        sequence,
      })
      this.db.prepare(`
        INSERT INTO axis_semantic_review_evidence (
          evidence_id, run_id, session_id, task_id, request_id, kind, sequence, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        evidence.evidenceId, evidence.runId, evidence.sessionId, evidence.taskId,
        evidence.requestId, evidence.kind, evidence.sequence, JSON.stringify(evidence),
      )
      return evidence
    })()
  }

  listForRun(runId: string): AxisSemanticReviewEvidence[] {
    const rows = this.db.prepare(`SELECT sequence, evidence_json FROM axis_semantic_review_evidence
      WHERE run_id = ? ORDER BY sequence ASC`).all(runId) as EvidenceRow[]
    return rows.map((row, index) => {
      const evidence = parseRow(row)
      if (row.sequence !== index + 1) throw new Error(`Axis semantic review sequence is not contiguous: ${runId}`)
      return evidence
    })
  }

  listForTask(runId: string, taskId: string): AxisSemanticReviewEvidence[] {
    return (this.db.prepare(`SELECT sequence, evidence_json FROM axis_semantic_review_evidence
      WHERE run_id = ? AND task_id = ? ORDER BY sequence ASC`).all(runId, taskId) as EvidenceRow[]).map(parseRow)
  }

  openReaderPort(): AxisSemanticReviewEvidenceReaderPort {
    return Object.freeze({
      listForSession: (sessionId: string, limit: number) => this.listForSession(sessionId, limit),
    })
  }

  private listForSession(sessionId: string, limit: number): { hasMore: boolean; items: AxisSemanticReviewEvidence[] } {
    assertReadLimit(limit)
    const rows = this.db.prepare(`SELECT sequence, evidence_json FROM axis_semantic_review_evidence
      WHERE session_id = ? ORDER BY rowid DESC LIMIT ?`).all(sessionId, limit + 1) as EvidenceRow[]
    return { hasMore: rows.length > limit, items: rows.slice(0, limit).map(parseRow) }
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare('DELETE FROM axis_semantic_review_evidence WHERE session_id = ?').run(sessionId).changes
  }

  close(): void { this.db.close() }
}

function assertReadLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Semantic review evidence read limit must be from 1 to 100')
}

function parseRow(row: EvidenceRow): AxisSemanticReviewEvidence {
  const evidence = AxisSemanticReviewEvidenceSchema.parse(JSON.parse(row.evidence_json) as unknown)
  if (evidence.sequence !== row.sequence) throw new Error(`Axis semantic review sequence mismatch: ${evidence.evidenceId}`)
  return evidence
}
