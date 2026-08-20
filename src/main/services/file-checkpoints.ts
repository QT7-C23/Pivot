import { randomUUID, createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FileCheckpointRecord, FileCheckpointRestoreResult } from '../../shared/types/domain'
import { assertAbsolutePath, readTextFile, writeTextFile } from './file-system'

interface FileCheckpointRow {
  content: string
  created_at: string
  file_path: string
  id: string
  session_id: string
  sha256: string
  size_bytes: number
}

const DEFAULT_DATABASE_PATH = ':memory:'

function toCheckpoint(row: FileCheckpointRow): FileCheckpointRecord {
  return {
    content: row.content,
    createdAt: row.created_at,
    filePath: row.file_path,
    id: row.id,
    sessionId: row.session_id,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
  }
}

export class FileCheckpointStore {
  private readonly db: Database

  constructor(databasePath = DEFAULT_DATABASE_PATH) {
    this.db = new Database(databasePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_file_checkpoints_session_created
        ON file_checkpoints(session_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_file_checkpoints_file_created
        ON file_checkpoints(file_path, created_at DESC);
    `)
  }

  async create(sessionId: string, projectRoot: string, filePath: string): Promise<FileCheckpointRecord> {
    const trimmedSessionId = sessionId.trim()
    if (!trimmedSessionId) {
      throw new Error('Expected a session id')
    }

    const resolvedFilePath = assertAbsolutePath(filePath)
    const content = await readTextFile(projectRoot, resolvedFilePath)
    const checkpoint: FileCheckpointRecord = {
      content,
      createdAt: new Date().toISOString(),
      filePath: resolvedFilePath,
      id: `checkpoint-${randomUUID()}`,
      sessionId: trimmedSessionId,
      sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    }

    this.db
      .prepare(`
        INSERT INTO file_checkpoints (
          id,
          session_id,
          file_path,
          content,
          size_bytes,
          sha256,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        checkpoint.id,
        checkpoint.sessionId,
        checkpoint.filePath,
        checkpoint.content,
        checkpoint.sizeBytes,
        checkpoint.sha256,
        checkpoint.createdAt,
      )

    return checkpoint
  }

  listForSession(sessionId: string): FileCheckpointRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM file_checkpoints WHERE session_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(sessionId) as FileCheckpointRow[]

    return rows.map(toCheckpoint)
  }

  get(checkpointId: string): FileCheckpointRecord | null {
    const row = this.db
      .prepare('SELECT * FROM file_checkpoints WHERE id = ?')
      .get(checkpointId) as FileCheckpointRow | undefined

    return row ? toCheckpoint(row) : null
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare('DELETE FROM file_checkpoints WHERE session_id = ?').run(sessionId).changes
  }

  async restore(checkpointId: string, projectRoot: string): Promise<FileCheckpointRestoreResult> {
    const checkpoint = this.get(checkpointId)
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`)
    }

    await writeTextFile(projectRoot, checkpoint.filePath, checkpoint.content)
    return {
      checkpointId: checkpoint.id,
      filePath: checkpoint.filePath,
      restoredAt: new Date().toISOString(),
      sha256: checkpoint.sha256,
      sizeBytes: checkpoint.sizeBytes,
    }
  }

  close(): void {
    this.db.close()
  }
}
