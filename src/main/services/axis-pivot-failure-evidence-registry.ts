import Database from 'better-sqlite3'
import {
  AxisPivotFailureEvidenceSchema,
  type AxisPivotFailureEvidence,
} from '../../shared/axis-pivot-failure-contracts'
import type { AxisPivotFailureEvidenceStorePort } from './axis-pivot-failure-ports'

interface FailureEvidenceRow {
  evidence_json: string
}

export class AxisPivotFailureEvidenceRegistry
implements AxisPivotFailureEvidenceStorePort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_failure_evidence (
        evidence_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        source_event_revision INTEGER NOT NULL,
        observed_at TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        UNIQUE(run_id, source_event_revision)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_failure_evidence_session
        ON axis_pivot_failure_evidence(session_id, observed_at DESC);
    `)
  }

  findBySource(
    runId: string,
    sourceEventRevision: number,
  ): AxisPivotFailureEvidence | null {
    const row = this.db.prepare(`
      SELECT evidence_json FROM axis_pivot_failure_evidence
      WHERE run_id = ? AND source_event_revision = ?
    `).get(runId, sourceEventRevision) as FailureEvidenceRow | undefined
    return row ? parseEvidence(row) : null
  }

  save(input: AxisPivotFailureEvidence): AxisPivotFailureEvidence {
    const evidence = AxisPivotFailureEvidenceSchema.parse(input)
    const existing = this.findBySource(
      evidence.runId,
      evidence.sourceEventRevision,
    )
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(evidence)) {
        throw new Error(
          'Axis Pivot failure evidence conflict for Run revision',
        )
      }
      return existing
    }
    this.db.prepare(`
      INSERT INTO axis_pivot_failure_evidence (
        evidence_id, run_id, session_id, source_event_revision,
        observed_at, evidence_json
      ) VALUES (
        @evidenceId, @runId, @sessionId, @sourceEventRevision,
        @observedAt, @evidenceJson
      )
    `).run({
      ...evidence,
      evidenceJson: JSON.stringify(evidence),
    })
    return evidence
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_pivot_failure_evidence WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}

function parseEvidence(row: FailureEvidenceRow): AxisPivotFailureEvidence {
  return AxisPivotFailureEvidenceSchema.parse(
    JSON.parse(row.evidence_json) as unknown,
  )
}
