import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  AttentionLifecycleRequestSchema,
  AttentionObservationSchema,
  AttentionRecordSchema,
  type AttentionLifecycleRequest,
  type AttentionObservation,
  type AttentionRecord,
  type AttentionStatus,
} from '../../shared/attention'
import type {
  AttentionLifecyclePort,
  AttentionObservationPort,
  AttentionReaderPort,
} from './attention-ports'

interface AttentionRow {
  context_label: string
  created_at: string
  detail: string
  id: string
  kind: string
  resolved_at: string | null
  revision: number
  schema_version: number
  severity: string
  source_id: string
  status: string
  title: string
  updated_at: string
}

export class SqliteAttentionAdapter {
  private readonly db: Database
  private readonly now: () => string
  private readonly randomId: () => string

  constructor(options: { databasePath?: string; now?: () => string; randomId?: () => string } = {}) {
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.now = options.now ?? (() => new Date().toISOString())
    this.randomId = options.randomId ?? randomUUID
    this.migrate()
  }

  openReaderPort(): AttentionReaderPort {
    return Object.freeze({ list: () => this.list() })
  }

  openObservationPort(): AttentionObservationPort {
    return Object.freeze({ observe: (observation: AttentionObservation) => this.observe(observation) })
  }

  openLifecyclePort(): AttentionLifecyclePort {
    return Object.freeze({
      resolve: (request: AttentionLifecycleRequest) => this.transition(request, 'resolved'),
      reopen: (request: AttentionLifecycleRequest) => this.transition(request, 'reopened'),
    })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attention_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attention_records (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        source_id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        severity TEXT NOT NULL,
        context_label TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );
    `)
    this.db.prepare(`
      INSERT OR IGNORE INTO attention_migrations (version, applied_at) VALUES (1, ?)
    `).run(this.now())
  }

  private list(): AttentionRecord[] {
    const rows = this.db.prepare(`
      SELECT id, schema_version, source_id, kind, severity, context_label, title, detail,
             status, revision, created_at, updated_at, resolved_at
      FROM attention_records ORDER BY updated_at DESC, id DESC LIMIT 500
    `).all() as AttentionRow[]
    try {
      return rows.map((row) => this.recordFromRow(row))
    } catch (error) {
      throw new Error('Invalid persisted Attention', { cause: error })
    }
  }

  private observe(input: unknown): AttentionRecord {
    const observation = AttentionObservationSchema.parse(input)
    return this.db.transaction(() => {
      const existing = this.findBySourceId(observation.sourceId)
      if (!existing) return this.insert(observation)
      const recurring = existing.status === 'resolved'
      if (!recurring && observationMatches(existing, observation)) return existing
      const updatedAt = this.now()
      const result = this.db.prepare(`
        UPDATE attention_records
        SET kind = ?, severity = ?, context_label = ?, title = ?, detail = ?,
            status = ?, revision = revision + 1, updated_at = ?, resolved_at = NULL
        WHERE id = ? AND revision = ?
      `).run(
        observation.kind,
        observation.severity,
        observation.contextLabel,
        observation.title,
        observation.detail,
        recurring ? 'reopened' : existing.status,
        updatedAt,
        existing.id,
        existing.revision,
      )
      if (result.changes !== 1) throw new Error(`Attention revision conflict: ${existing.id}`)
      return this.requireRecord(existing.id)
    })()
  }

  private insert(observation: AttentionObservation): AttentionRecord {
    const id = this.randomId()
    const timestamp = this.now()
    this.db.prepare(`
      INSERT INTO attention_records (
        id, schema_version, source_id, kind, severity, context_label, title, detail,
        status, revision, created_at, updated_at, resolved_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, NULL)
    `).run(
      id,
      observation.sourceId,
      observation.kind,
      observation.severity,
      observation.contextLabel,
      observation.title,
      observation.detail,
      timestamp,
      timestamp,
    )
    return this.requireRecord(id)
  }

  private transition(input: unknown, status: Extract<AttentionStatus, 'resolved' | 'reopened'>): AttentionRecord {
    const request = AttentionLifecycleRequestSchema.parse(input)
    return this.db.transaction(() => {
      const existing = this.findById(request.attentionId)
      if (!existing) throw new Error(`Attention record not found: ${request.attentionId}`)
      if (existing.revision !== request.expectedRevision) {
        throw new Error(`Attention revision conflict: expected ${request.expectedRevision}, found ${existing.revision}`)
      }
      if (existing.status === status || (status === 'reopened' && existing.status === 'open')) return existing
      const updatedAt = this.now()
      const result = this.db.prepare(`
        UPDATE attention_records
        SET status = ?, revision = revision + 1, updated_at = ?, resolved_at = ?
        WHERE id = ? AND revision = ?
      `).run(
        status,
        updatedAt,
        status === 'resolved' ? updatedAt : null,
        existing.id,
        existing.revision,
      )
      if (result.changes !== 1) throw new Error(`Attention revision conflict: ${existing.id}`)
      return this.requireRecord(existing.id)
    })()
  }

  private findById(id: string): AttentionRecord | null {
    const row = this.db.prepare(`
      SELECT id, schema_version, source_id, kind, severity, context_label, title, detail,
             status, revision, created_at, updated_at, resolved_at
      FROM attention_records WHERE id = ?
    `).get(id) as AttentionRow | undefined
    return row ? this.recordFromRow(row) : null
  }

  private findBySourceId(sourceId: string): AttentionRecord | null {
    const row = this.db.prepare(`
      SELECT id, schema_version, source_id, kind, severity, context_label, title, detail,
             status, revision, created_at, updated_at, resolved_at
      FROM attention_records WHERE source_id = ?
    `).get(sourceId) as AttentionRow | undefined
    return row ? this.recordFromRow(row) : null
  }

  private requireRecord(id: string): AttentionRecord {
    const record = this.findById(id)
    if (!record) throw new Error(`Attention record not found after write: ${id}`)
    return record
  }

  private recordFromRow(row: AttentionRow): AttentionRecord {
    return AttentionRecordSchema.parse({
      contextLabel: row.context_label,
      createdAt: row.created_at,
      detail: row.detail,
      id: row.id,
      kind: row.kind,
      resolvedAt: row.resolved_at,
      revision: row.revision,
      schemaVersion: row.schema_version,
      severity: row.severity,
      sourceId: row.source_id,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
    })
  }
}

function observationMatches(record: AttentionRecord, observation: AttentionObservation): boolean {
  return record.contextLabel === observation.contextLabel
    && record.detail === observation.detail
    && record.kind === observation.kind
    && record.severity === observation.severity
    && record.title === observation.title
}
