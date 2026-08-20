import Database from 'better-sqlite3'
import { EngineTraceSchema, type EngineTrace } from '../../shared/axis-engine-contracts'

interface AxisTraceRow {
  trace_json: string
}

export class AxisTraceRegistry {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_engine_traces (
        run_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        trace_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_traces_session_started
        ON axis_engine_traces(session_id, started_at DESC);
    `)
  }

  save(traceInput: EngineTrace): EngineTrace {
    const trace = EngineTraceSchema.parse(traceInput)
    this.db.prepare(`
      INSERT INTO axis_engine_traces (run_id, trace_id, session_id, started_at, updated_at, trace_json)
      VALUES (@runId, @traceId, @sessionId, @startedAt, @updatedAt, @traceJson)
      ON CONFLICT(run_id) DO UPDATE SET
        trace_id = excluded.trace_id,
        session_id = excluded.session_id,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        trace_json = excluded.trace_json
    `).run({
      runId: trace.runId,
      sessionId: trace.sessionId,
      startedAt: trace.startedAt,
      traceId: trace.traceId,
      traceJson: JSON.stringify(trace),
      updatedAt: trace.events.at(-1)?.timestamp ?? trace.startedAt,
    })
    return trace
  }

  get(runId: string): EngineTrace | null {
    const row = this.db.prepare('SELECT trace_json FROM axis_engine_traces WHERE run_id = ?').get(runId) as AxisTraceRow | undefined
    return row ? parseRow(row) : null
  }

  list(sessionId: string, limit = 50): EngineTrace[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Axis trace list limit must be between 1 and 100')
    return (this.db.prepare(`
      SELECT trace_json FROM axis_engine_traces
      WHERE session_id = ? ORDER BY started_at DESC, trace_id DESC LIMIT ?
    `).all(sessionId, limit) as AxisTraceRow[]).map(parseRow)
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare('DELETE FROM axis_engine_traces WHERE session_id = ?').run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}

function parseRow(row: AxisTraceRow): EngineTrace {
  return EngineTraceSchema.parse(JSON.parse(row.trace_json) as unknown)
}
