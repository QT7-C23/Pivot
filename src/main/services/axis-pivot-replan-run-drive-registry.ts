import Database from 'better-sqlite3'
import {
  AxisPivotReplanRunDriveResultSchema,
  type AxisPivotReplanRunDriveResult,
} from '../../shared/axis-pivot-replan-run-driver-contracts'
import type { AxisPivotReplanRunDriveResultPort } from './axis-pivot-replan-run-driver-ports'

const SCHEMA_VERSION = 1
interface Row { result_json: string }

export class AxisPivotReplanRunDriveRegistry
implements AxisPivotReplanRunDriveResultPort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_replan_run_drive_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO axis_pivot_replan_run_drive_schema (singleton, version)
      VALUES (1, ${SCHEMA_VERSION});
      CREATE TABLE IF NOT EXISTS axis_pivot_replan_run_drive_results (
        decision_id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
        status TEXT NOT NULL, result_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_replan_run_drive_session
        ON axis_pivot_replan_run_drive_results(session_id, decision_id);
    `)
    const schema = this.db.prepare(`SELECT version FROM axis_pivot_replan_run_drive_schema WHERE singleton = 1`).get() as { version: number } | undefined
    if (schema?.version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(`Unsupported Axis Pivot replan Run drive schema: ${schema?.version ?? 'missing'}`)
    }
  }

  save(input: AxisPivotReplanRunDriveResult): AxisPivotReplanRunDriveResult {
    const result = AxisPivotReplanRunDriveResultSchema.parse(input)
    const existing = this.find(result.decisionId)
    if (existing) return requireSame(existing, result)
    try {
      this.db.prepare(`INSERT INTO axis_pivot_replan_run_drive_results (
        decision_id, session_id, status, result_json
      ) VALUES (?, ?, ?, ?)`).run(
        result.decisionId, result.sessionId, result.status, JSON.stringify(result),
      )
      return result
    } catch (error) {
      const concurrent = this.find(result.decisionId)
      if (concurrent) return requireSame(concurrent, result)
      throw error
    }
  }

  find(decisionId: string): AxisPivotReplanRunDriveResult | null {
    const row = this.db.prepare(`SELECT result_json FROM axis_pivot_replan_run_drive_results WHERE decision_id = ?`).get(decisionId) as Row | undefined
    return row ? AxisPivotReplanRunDriveResultSchema.parse(JSON.parse(row.result_json) as unknown) : null
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM axis_pivot_replan_run_drive_results WHERE session_id = ?`).run(sessionId)
  }

  close(): void { this.db.close() }
}

function requireSame(
  existing: AxisPivotReplanRunDriveResult,
  candidate: AxisPivotReplanRunDriveResult,
): AxisPivotReplanRunDriveResult {
  if (JSON.stringify(existing) !== JSON.stringify(candidate)) {
    throw new Error(`Axis Pivot replan Run drive result conflict: ${candidate.decisionId}`)
  }
  return existing
}
