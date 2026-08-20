import Database from 'better-sqlite3'
import {
  AxisPivotContinuationHandoffSchema,
  type AxisPivotContinuationHandoff,
} from '../../shared/axis-pivot-failure-contracts'
import type { AxisPivotContinuationStorePort } from './axis-pivot-failure-ports'

interface ContinuationRow {
  handoff_json: string
}

export class AxisPivotContinuationRegistry
implements AxisPivotContinuationStorePort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_continuation_handoffs (
        handoff_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        handoff_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_continuation_session
        ON axis_pivot_continuation_handoffs(session_id, created_at DESC);
    `)
  }

  findByDecision(decisionId: string): AxisPivotContinuationHandoff | null {
    const row = this.db.prepare(`
      SELECT handoff_json FROM axis_pivot_continuation_handoffs
      WHERE decision_id = ?
    `).get(decisionId) as ContinuationRow | undefined
    return row ? parseHandoff(row) : null
  }

  save(input: AxisPivotContinuationHandoff): AxisPivotContinuationHandoff {
    const handoff = AxisPivotContinuationHandoffSchema.parse(input)
    const existing = this.findByDecision(handoff.decisionId)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(handoff)) {
        throw new Error(
          'Axis Pivot continuation handoff conflict for decision',
        )
      }
      return existing
    }
    this.db.prepare(`
      INSERT INTO axis_pivot_continuation_handoffs (
        handoff_id, decision_id, run_id, session_id, created_at, handoff_json
      ) VALUES (
        @handoffId, @decisionId, @runId, @sessionId, @createdAt, @handoffJson
      )
    `).run({
      ...handoff,
      handoffJson: JSON.stringify(handoff),
    })
    return handoff
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_pivot_continuation_handoffs WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}

function parseHandoff(row: ContinuationRow): AxisPivotContinuationHandoff {
  return AxisPivotContinuationHandoffSchema.parse(
    JSON.parse(row.handoff_json) as unknown,
  )
}
