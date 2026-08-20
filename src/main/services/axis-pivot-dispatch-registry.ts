import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  AxisPivotDispatchResultSchema,
  type AxisPivotDispatchResult,
} from '../../shared/axis-pivot-action-contracts'

interface DispatchRow {
  result_json: string
}

const DecisionIdSchema = z.string().trim().min(1).max(160)

export class AxisPivotDispatchRegistry {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_dispatch_results (
        decision_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        route TEXT NOT NULL,
        result_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_dispatch_session
        ON axis_pivot_dispatch_results(session_id, run_id);
    `)
  }

  save(resultInput: AxisPivotDispatchResult): AxisPivotDispatchResult {
    const result = AxisPivotDispatchResultSchema.parse(resultInput)
    if (this.find(result.decisionId)) {
      throw new Error(
        `Axis Pivot decision dispatch already recorded: ${result.decisionId}`,
      )
    }
    this.db.prepare(`
      INSERT INTO axis_pivot_dispatch_results (
        decision_id, run_id, session_id, action, route, result_json
      ) VALUES (
        @decisionId, @runId, @sessionId, @action, @route, @resultJson
      )
    `).run({
      action: result.result.action,
      decisionId: result.decisionId,
      resultJson: JSON.stringify(result),
      route: result.route,
      runId: result.runId,
      sessionId: result.sessionId,
    })
    return result
  }

  find(decisionIdInput: string): AxisPivotDispatchResult | null {
    const decisionId = DecisionIdSchema.parse(decisionIdInput)
    const row = this.db.prepare(`
      SELECT result_json FROM axis_pivot_dispatch_results
      WHERE decision_id = ?
    `).get(decisionId) as DispatchRow | undefined
    return row
      ? AxisPivotDispatchResultSchema.parse(
          JSON.parse(row.result_json) as unknown,
        )
      : null
  }

  deleteForSession(sessionIdInput: string): void {
    const sessionId = DecisionIdSchema.parse(sessionIdInput)
    this.db.prepare(`
      DELETE FROM axis_pivot_dispatch_results WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}
