import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  FeedbackAttachmentSchema,
  FeedbackRecordSchema,
  FeedbackSubmissionRequestSchema,
  type FeedbackAttachment,
  type FeedbackRecord,
  type FeedbackSubmissionRequest,
} from '../../shared/feedback'
import type {
  FeedbackAttachmentStagingPort,
  FeedbackAttachmentDiscardPort,
  FeedbackReaderPort,
  FeedbackWriterPort,
} from './feedback-ports'

interface FeedbackRow {
  created_at: string
  description: string
  id: string
  priority: string
  schema_version: number
  status: string
  title: string
  type: string
}

interface AttachmentRow {
  byte_length: number
  feedback_id: string | null
  file_name: string
  id: string
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENTS = 5
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  '.gif', '.jpeg', '.jpg', '.json', '.log', '.md', '.png', '.txt', '.webp',
])

export class SqliteFeedbackAdapter {
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

  openReaderPort(): FeedbackReaderPort {
    return Object.freeze({ list: () => this.list() })
  }

  openWriterPort(): FeedbackWriterPort {
    return Object.freeze({ submit: (request: FeedbackSubmissionRequest) => this.submit(request) })
  }

  openAttachmentStagingPort(): FeedbackAttachmentStagingPort {
    return Object.freeze({ stagePaths: (paths: readonly string[]) => this.stagePaths(paths) })
  }

  openAttachmentDiscardPort(): FeedbackAttachmentDiscardPort {
    return Object.freeze({ discard: (attachmentId: string) => this.discardAttachment(attachmentId) })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS feedback_records (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS feedback_attachments (
        id TEXT PRIMARY KEY,
        feedback_id TEXT REFERENCES feedback_records(id),
        file_name TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        content BLOB NOT NULL,
        staged_at TEXT NOT NULL
      );
    `)
    this.db.prepare(`
      INSERT OR IGNORE INTO feedback_migrations (version, applied_at) VALUES (1, ?)
    `).run(this.now())
    this.db.prepare('DELETE FROM feedback_attachments WHERE feedback_id IS NULL').run()
  }

  private list(): FeedbackRecord[] {
    const rows = this.db.prepare(`
      SELECT id, schema_version, created_at, type, priority, title, description, status
      FROM feedback_records ORDER BY created_at DESC, id DESC LIMIT 500
    `).all() as FeedbackRow[]
    try {
      return rows.map((row) => this.recordFromRow(row))
    } catch (error) {
      throw new Error('Invalid persisted feedback', { cause: error })
    }
  }

  private submit(input: unknown): FeedbackRecord {
    const request = FeedbackSubmissionRequestSchema.parse(input)
    return this.db.transaction(() => {
      const existing = this.findRecord(request.submissionId)
      if (existing) {
        if (!submissionMatches(existing, request)) {
          throw new Error(`Feedback submission id conflict: ${request.submissionId}`)
        }
        return existing
      }
      const attachments = request.attachmentIds.map((id) => this.getAvailableAttachment(id))
      const createdAt = this.now()
      this.db.prepare(`
        INSERT INTO feedback_records (
          id, schema_version, created_at, type, priority, title, description, status
        ) VALUES (?, 1, ?, ?, ?, ?, ?, 'saved-locally')
      `).run(
        request.submissionId,
        createdAt,
        request.type,
        request.priority,
        request.title,
        request.description,
      )
      const claim = this.db.prepare(`
        UPDATE feedback_attachments SET feedback_id = ? WHERE id = ? AND feedback_id IS NULL
      `)
      for (const attachment of attachments) {
        if (claim.run(request.submissionId, attachment.id).changes !== 1) {
          throw new Error(`Feedback attachment is no longer available: ${attachment.id}`)
        }
      }
      return FeedbackRecordSchema.parse({
        ...request,
        attachments,
        createdAt,
        schemaVersion: 1,
        status: 'saved-locally',
      })
    })()
  }

  private stagePaths(input: readonly string[]): FeedbackAttachment[] {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ATTACHMENTS) {
      throw new Error(`Expected between 1 and ${MAX_ATTACHMENTS} feedback attachments`)
    }
    if (new Set(input).size !== input.length) throw new Error('Duplicate feedback attachment path')
    return this.db.transaction(() => input.map((filePath) => {
      const extension = path.extname(filePath).toLocaleLowerCase('en')
      if (!SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension)) {
        throw new Error(`Unsupported feedback attachment type: ${extension || '(none)'}`)
      }
      const stats = statSync(filePath)
      if (!stats.isFile()) throw new Error(`Feedback attachment is not a file: ${filePath}`)
      if (stats.size > MAX_ATTACHMENT_BYTES) throw new Error('Feedback attachment exceeds 10 MiB')
      const attachment = FeedbackAttachmentSchema.parse({
        byteLength: stats.size,
        id: this.randomId(),
        name: path.basename(filePath),
      })
      const content = readFileSync(filePath)
      if (content.byteLength !== attachment.byteLength) {
        throw new Error(`Feedback attachment changed while reading: ${attachment.name}`)
      }
      this.db.prepare(`
        INSERT INTO feedback_attachments (
          id, feedback_id, file_name, byte_length, content, staged_at
        ) VALUES (?, NULL, ?, ?, ?, ?)
      `).run(attachment.id, attachment.name, attachment.byteLength, content, this.now())
      return attachment
    }))()
  }

  private getAvailableAttachment(id: string): FeedbackAttachment {
    const row = this.db.prepare(`
      SELECT id, feedback_id, file_name, byte_length
      FROM feedback_attachments WHERE id = ?
    `).get(id) as AttachmentRow | undefined
    if (!row || row.feedback_id !== null) throw new Error(`Feedback attachment is unavailable: ${id}`)
    return FeedbackAttachmentSchema.parse({
      byteLength: row.byte_length,
      id: row.id,
      name: row.file_name,
    })
  }

  private discardAttachment(attachmentId: string): void {
    const parsedId = FeedbackAttachmentSchema.shape.id.parse(attachmentId)
    const result = this.db.prepare(`
      DELETE FROM feedback_attachments WHERE id = ? AND feedback_id IS NULL
    `).run(parsedId)
    if (result.changes !== 1) {
      throw new Error(`Feedback attachment cannot be discarded: ${parsedId}`)
    }
  }

  private findRecord(id: string): FeedbackRecord | null {
    const row = this.db.prepare(`
      SELECT id, schema_version, created_at, type, priority, title, description, status
      FROM feedback_records WHERE id = ?
    `).get(id) as FeedbackRow | undefined
    return row ? this.recordFromRow(row) : null
  }

  private recordFromRow(row: FeedbackRow): FeedbackRecord {
    const attachmentRows = this.db.prepare(`
      SELECT id, feedback_id, file_name, byte_length
      FROM feedback_attachments WHERE feedback_id = ? ORDER BY rowid
    `).all(row.id) as AttachmentRow[]
    const attachments = attachmentRows.map((attachment) => FeedbackAttachmentSchema.parse({
      byteLength: attachment.byte_length,
      id: attachment.id,
      name: attachment.file_name,
    }))
    return FeedbackRecordSchema.parse({
      attachmentIds: attachments.map(({ id }) => id),
      attachments,
      createdAt: row.created_at,
      description: row.description,
      priority: row.priority,
      schemaVersion: row.schema_version,
      status: row.status,
      submissionId: row.id,
      title: row.title,
      type: row.type,
    })
  }
}

function submissionMatches(record: FeedbackRecord, request: FeedbackSubmissionRequest): boolean {
  return record.description === request.description
    && record.priority === request.priority
    && record.title === request.title
    && record.type === request.type
    && record.attachmentIds.length === request.attachmentIds.length
    && record.attachmentIds.every((id, index) => id === request.attachmentIds[index])
}
