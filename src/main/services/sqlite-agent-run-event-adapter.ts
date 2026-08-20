import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AgentRunEventAppendSchema,
  AgentRunEventSchema,
  type AgentRunEvent,
  type AgentRunEventAppend,
} from '../../shared/agent-run-events'
import type {
  AgentRunEventLifecyclePort,
  AgentRunEventReaderPort,
  AgentRunEventWriterPort,
} from './agent-run-event-ports'

interface AgentRunEventRow {
  event_id: string
  occurred_at: string
  payload_json: string
  run_id: string
  schema_version: number
  sequence: number
  session_id: string
  type: string
}

interface RunStateRow {
  session_id: string
  terminal_count: number
}

const CURRENT_MIGRATION_VERSION = 1

export class SqliteAgentRunEventAdapter {
  private readonly db: Database
  private readonly now: () => string
  private readonly randomId: () => string

  constructor(options: { databasePath?: string; now?: () => string; randomId?: () => string } = {}) {
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.now = options.now ?? (() => new Date().toISOString())
    this.randomId = options.randomId ?? (() => `event-${randomUUID()}`)
    this.migrate()
  }

  openWriterPort(): AgentRunEventWriterPort {
    return Object.freeze({ append: (event: AgentRunEventAppend) => this.append(event) })
  }

  openReaderPort(): AgentRunEventReaderPort {
    return Object.freeze({
      listRun: (runId: string) => this.list('run_id', runId),
      listSession: (sessionId: string) => this.list('session_id', sessionId),
    })
  }

  openLifecyclePort(): AgentRunEventLifecyclePort {
    return Object.freeze({ deleteForSession: (sessionId: string) => this.deleteForSession(sessionId) })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_run_event_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = new Set(
      (this.db.prepare('SELECT version FROM agent_run_event_migrations').all() as Array<{ version: number }>)
        .map(({ version }) => version),
    )
    if (applied.has(CURRENT_MIGRATION_VERSION)) return
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE agent_run_events (
          event_id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL CHECK (schema_version = 1),
          session_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          sequence INTEGER NOT NULL CHECK (sequence >= 1),
          type TEXT NOT NULL CHECK (type IN (
            'run-started', 'phase-changed', 'permission-resolved',
            'tool-started', 'tool-finished', 'run-finished'
          )),
          payload_json TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          UNIQUE (session_id, sequence)
        );
        CREATE INDEX idx_agent_run_events_run ON agent_run_events(run_id, sequence);
      `)
      this.db.prepare(`
        INSERT INTO agent_run_event_migrations (version, applied_at) VALUES (?, ?)
      `).run(CURRENT_MIGRATION_VERSION, this.now())
    })()
  }

  private append(input: unknown): AgentRunEvent {
    const event = AgentRunEventAppendSchema.parse(input)
    return this.db.transaction(() => {
      this.requireValidRunTransition(event)
      const sequence = (this.db.prepare(`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
        FROM agent_run_events WHERE session_id = ?
      `).get(event.sessionId) as { sequence: number }).sequence
      const record = AgentRunEventSchema.parse({
        ...event,
        eventId: this.randomId(),
        occurredAt: this.now(),
        schemaVersion: 1,
        sequence,
      })
      this.db.prepare(`
        INSERT INTO agent_run_events (
          event_id, schema_version, session_id, run_id, sequence, type, payload_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.eventId,
        record.schemaVersion,
        record.sessionId,
        record.runId,
        record.sequence,
        record.type,
        JSON.stringify(record.data),
        record.occurredAt,
      )
      return record
    })()
  }

  private requireValidRunTransition(event: AgentRunEventAppend): void {
    const state = this.db.prepare(`
      SELECT session_id,
             SUM(CASE WHEN type = 'run-finished' THEN 1 ELSE 0 END) AS terminal_count
      FROM agent_run_events WHERE run_id = ? GROUP BY session_id
    `).get(event.runId) as RunStateRow | undefined
    if (!state) {
      if (event.type !== 'run-started') throw new Error(`Agent run must start before ${event.type}: ${event.runId}`)
      return
    }
    if (state.session_id !== event.sessionId) throw new Error(`Agent run ownership mismatch: ${event.runId}`)
    if (event.type === 'run-started') throw new Error(`Agent run already started: ${event.runId}`)
    if (state.terminal_count > 0) throw new Error(`Agent run already finished: ${event.runId}`)
  }

  private list(column: 'run_id' | 'session_id', value: string): AgentRunEvent[] {
    const identifier = AgentRunEventAppendSchema.options[0].shape[
      column === 'run_id' ? 'runId' : 'sessionId'
    ].parse(value)
    const rows = this.db.prepare(`
      SELECT event_id, schema_version, session_id, run_id, sequence, type, payload_json, occurred_at
      FROM agent_run_events WHERE ${column} = ? ORDER BY sequence ASC
    `).all(identifier) as AgentRunEventRow[]
    try {
      return rows.map((row) => AgentRunEventSchema.parse({
        data: JSON.parse(row.payload_json) as unknown,
        eventId: row.event_id,
        occurredAt: row.occurred_at,
        runId: row.run_id,
        schemaVersion: row.schema_version,
        sequence: row.sequence,
        sessionId: row.session_id,
        type: row.type,
      }))
    } catch (error) {
      throw new Error('Invalid persisted Agent Run Event', { cause: error })
    }
  }

  private deleteForSession(sessionId: string): void {
    const parsed = AgentRunEventAppendSchema.options[0].shape.sessionId.parse(sessionId)
    this.db.prepare('DELETE FROM agent_run_events WHERE session_id = ?').run(parsed)
  }
}
