import { randomUUID } from 'node:crypto'
import path from 'node:path'
import Database from 'better-sqlite3'
import type {
  AgentAdapterInfo,
  ChatMessage,
  ProjectHistoryEntry,
  SessionGroupRecord,
  SessionMetadataPatch,
  SessionRecord,
} from '../../shared/types/domain'

type SessionStatus = SessionRecord['status']
type MessageRole = ChatMessage['role']

interface SessionRow {
  created_at: string
  deleted_at: string | null
  group_id: string | null
  id: string
  is_favorite: number
  is_pinned: number
  is_unread: number
  project_path: string
  status: SessionStatus
  tags_json: string
  title: string
  updated_at: string
}

interface SessionGroupRow {
  created_at: string
  id: string
  name: string
  parent_id: string | null
}

interface MessageRow {
  id: string
  role: MessageRole
  session_id: string
  text: string
  timestamp: string
}

interface ProjectHistoryRow {
  last_opened_at: string
  path: string
  title: string
}

const DEFAULT_DATABASE_PATH = ':memory:'

function toSession(row: SessionRow): SessionRecord {
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    groupId: row.group_id,
    id: row.id,
    isFavorite: row.is_favorite === 1,
    isPinned: row.is_pinned === 1,
    isUnread: row.is_unread === 1,
    projectPath: row.project_path,
    status: row.status,
    tags: parseTags(row.tags_json),
    title: row.title,
    updatedAt: row.updated_at,
  }
}

function toGroup(row: SessionGroupRow): SessionGroupRecord {
  return { createdAt: row.created_at, id: row.id, name: row.name, parentId: row.parent_id }
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    sessionId: row.session_id,
    text: row.text,
    timestamp: row.timestamp,
  }
}

function toProjectHistory(row: ProjectHistoryRow): ProjectHistoryEntry {
  return {
    lastOpenedAt: row.last_opened_at,
    path: row.path,
    title: row.title,
  }
}

export class SessionRegistry {
  private readonly db: Database

  constructor(databasePath = DEFAULT_DATABASE_PATH) {
    this.db = new Database(databasePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'archived')),
        is_pinned INTEGER NOT NULL CHECK (is_pinned IN (0, 1)),
        is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
        is_unread INTEGER NOT NULL DEFAULT 0 CHECK (is_unread IN (0, 1)),
        tags_json TEXT NOT NULL DEFAULT '[]',
        group_id TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp ON messages(session_id, timestamp ASC);

      CREATE TABLE IF NOT EXISTS project_history (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_history_last_opened_at ON project_history(last_opened_at DESC);

      CREATE TABLE IF NOT EXISTS session_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        created_at TEXT NOT NULL
      );
    `)
    this.ensureSessionColumns()
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(
        session_id UNINDEXED,
        title,
        content
      );
    `)
    this.rebuildSearchIndex()
  }

  list(): SessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC')
      .all() as SessionRow[]

    return rows.map(toSession)
  }

  get(id: string): SessionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined

    return row ? toSession(row) : null
  }

  getActive(id: string): SessionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SessionRow | undefined
    return row ? toSession(row) : null
  }

  create(projectPath: string, title?: string): SessionRecord {
    const now = new Date().toISOString()
    const session: SessionRecord = {
      createdAt: now,
      deletedAt: null,
      groupId: null,
      id: `session-${randomUUID()}`,
      isFavorite: false,
      isPinned: false,
      isUnread: false,
      projectPath,
      status: 'active',
      tags: [],
      title: title?.trim() || path.basename(projectPath) || 'Untitled Project',
      updatedAt: now,
    }

    this.db
      .prepare(`
        INSERT INTO sessions (
          id,
          title,
          project_path,
          status,
          is_pinned,
          is_favorite,
          is_unread,
          tags_json,
          group_id,
          deleted_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.id,
        session.title,
        session.projectPath,
        session.status,
        session.isPinned ? 1 : 0,
        session.isFavorite ? 1 : 0,
        session.isUnread ? 1 : 0,
        JSON.stringify(session.tags),
        session.groupId,
        session.deletedAt,
        session.createdAt,
        session.updatedAt,
      )

    this.updateSearchIndex(session.id)
    this.recordProjectOpen(projectPath, session.title)
    return session
  }

  openProject(projectPath: string, title?: string): SessionRecord {
    const existing = this.db
      .prepare('SELECT * FROM sessions WHERE project_path = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1')
      .get(projectPath) as SessionRow | undefined

    if (!existing) {
      return this.create(projectPath, title)
    }

    const now = new Date().toISOString()
    const session: SessionRecord = {
      ...toSession(existing),
      status: 'active',
      title: title?.trim() || existing.title,
      updatedAt: now,
    }

    this.db
      .prepare('UPDATE sessions SET title = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(session.title, session.status, session.updatedAt, session.id)

    this.recordProjectOpen(session.projectPath, session.title)
    this.updateSearchIndex(session.id)
    return session
  }

  getLastProject(): ProjectHistoryEntry | null {
    const row = this.db
      .prepare('SELECT * FROM project_history ORDER BY last_opened_at DESC LIMIT 1')
      .get() as ProjectHistoryRow | undefined

    return row ? toProjectHistory(row) : null
  }

  listRecentProjects(limit = 8): ProjectHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM project_history ORDER BY last_opened_at DESC LIMIT ?')
      .all(limit) as ProjectHistoryRow[]

    return rows.map(toProjectHistory)
  }

  recordProjectOpen(projectPath: string, title = path.basename(projectPath) || 'Untitled Project'): ProjectHistoryEntry {
    const entry: ProjectHistoryEntry = {
      lastOpenedAt: new Date().toISOString(),
      path: projectPath,
      title,
    }

    this.db
      .prepare(`
        INSERT INTO project_history (path, title, last_opened_at)
        VALUES (?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          title = excluded.title,
          last_opened_at = excluded.last_opened_at
      `)
      .run(entry.path, entry.title, entry.lastOpenedAt)

    return entry
  }

  search(query: string): SessionRecord[] {
    const trimmed = query.trim()
    if (!trimmed) return this.list()
    const match = trimmed.split(/\s+/).map((term) => `"${term.replaceAll('"', '""')}"*`).join(' AND ')
    const rows = this.db.prepare(`
      SELECT sessions.* FROM session_search
      JOIN sessions ON sessions.id = session_search.session_id
      WHERE session_search MATCH ? AND sessions.deleted_at IS NULL
      ORDER BY sessions.is_pinned DESC, sessions.updated_at DESC
    `).all(match) as SessionRow[]
    return rows.map(toSession)
  }

  updateMetadata(id: string, patch: SessionMetadataPatch): SessionRecord {
    const current = this.get(id)
    if (!current) throw new Error(`Session not found: ${id}`)
    if (patch.groupId && !this.getGroup(patch.groupId)) throw new Error(`Session group not found: ${patch.groupId}`)
    const updated: SessionRecord = {
      ...current,
      groupId: patch.groupId === undefined ? current.groupId : patch.groupId,
      isFavorite: patch.isFavorite ?? current.isFavorite,
      isUnread: patch.isUnread ?? current.isUnread,
      status: patch.status ?? current.status,
      tags: patch.tags === undefined ? current.tags : normalizeTags(patch.tags),
      title: patch.title?.trim() || current.title,
      updatedAt: new Date().toISOString(),
    }
    this.db.prepare(`
      UPDATE sessions SET
        title = ?, status = ?, is_favorite = ?, is_unread = ?, tags_json = ?, group_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.title,
      updated.status,
      updated.isFavorite ? 1 : 0,
      updated.isUnread ? 1 : 0,
      JSON.stringify(updated.tags),
      updated.groupId,
      updated.updatedAt,
      id,
    )
    this.updateSearchIndex(id)
    return this.get(id)!
  }

  createGroup(name: string, parentId: string | null = null): SessionGroupRecord {
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('Expected a session group name')
    if (parentId && !this.getGroup(parentId)) throw new Error(`Parent session group not found: ${parentId}`)
    const group: SessionGroupRecord = {
      createdAt: new Date().toISOString(),
      id: `group-${randomUUID()}`,
      name: normalizedName,
      parentId,
    }
    this.db.prepare('INSERT INTO session_groups (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)')
      .run(group.id, group.name, group.parentId, group.createdAt)
    return group
  }

  listGroups(): SessionGroupRecord[] {
    return (this.db.prepare('SELECT * FROM session_groups ORDER BY created_at ASC').all() as SessionGroupRow[]).map(toGroup)
  }

  renameGroup(id: string, name: string): SessionGroupRecord {
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('Expected a session group name')
    const result = this.db.prepare('UPDATE session_groups SET name = ? WHERE id = ?').run(normalizedName, id)
    if (result.changes === 0) throw new Error(`Session group not found: ${id}`)
    return this.getGroup(id)!
  }

  deleteGroup(id: string): void {
    this.db.prepare('UPDATE sessions SET group_id = NULL WHERE group_id = ?').run(id)
    this.db.prepare('UPDATE session_groups SET parent_id = NULL WHERE parent_id = ?').run(id)
    this.db.prepare('DELETE FROM session_groups WHERE id = ?').run(id)
  }

  fork(id: string): SessionRecord {
    const source = this.getActive(id)
    if (!source) throw new Error(`Active session not found: ${id}`)
    const fork = this.create(source.projectPath, `${source.title} (fork)`)
    this.updateMetadata(fork.id, {
      groupId: source.groupId,
      isFavorite: source.isFavorite,
      tags: source.tags,
    })
    for (const message of this.listMessages(id)) this.addMessage(fork.id, message.role, message.text)
    return this.get(fork.id)!
  }

  softDelete(id: string): SessionRecord {
    const deletedAt = new Date().toISOString()
    const result = this.db.prepare('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(deletedAt, deletedAt, id)
    if (result.changes === 0) throw new Error(`Session not found: ${id}`)
    return this.get(id)!
  }

  undoDelete(id: string): SessionRecord {
    const updatedAt = new Date().toISOString()
    const result = this.db.prepare('UPDATE sessions SET deleted_at = NULL, updated_at = ? WHERE id = ?')
      .run(updatedAt, id)
    if (result.changes === 0) throw new Error(`Session not found: ${id}`)
    return this.get(id)!
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM session_search WHERE session_id = ?').run(id)
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  setPinned(id: string, isPinned: boolean): SessionRecord {
    const updatedAt = new Date().toISOString()
    const result = this.db
      .prepare('UPDATE sessions SET is_pinned = ?, updated_at = ? WHERE id = ?')
      .run(isPinned ? 1 : 0, updatedAt, id)
    if (result.changes === 0) throw new Error(`Session not found: ${id}`)
    return this.get(id)!
  }

  addMessage(sessionId: string, role: MessageRole, text: string): ChatMessage {
    const message: ChatMessage = {
      id: `message-${randomUUID()}`,
      role,
      sessionId,
      text,
      timestamp: new Date().toISOString(),
    }

    this.db
      .prepare(`
        INSERT INTO messages (
          id,
          session_id,
          role,
          text,
          timestamp
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(message.id, message.sessionId, message.role, message.text, message.timestamp)

    this.db
      .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(message.timestamp, sessionId)

    if (role === 'assistant') this.generateTitleFromFirstRequest(sessionId)
    this.updateSearchIndex(sessionId)

    return message
  }

  listMessages(sessionId: string): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC, rowid ASC')
      .all(sessionId) as MessageRow[]

    return rows.map(toMessage)
  }

  export(id: string, format: 'markdown' | 'json', context: { adapterInfo?: AgentAdapterInfo } = {}): string {
    const session = this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }
    const messages = this.listMessages(id)

    if (format === 'json') {
      return JSON.stringify(
        {
          adapter: context.adapterInfo ?? null,
          messages,
          session,
        },
        null,
        2,
      )
    }

    return [
      '---',
      `id: ${session.id}`,
      `project: ${JSON.stringify(session.projectPath)}`,
      `status: ${session.status}`,
      `tags: ${JSON.stringify(session.tags)}`,
      `created: ${session.createdAt}`,
      `updated: ${session.updatedAt}`,
      '---',
      '',
      `# ${session.title}`,
      '',
      `- ID: ${session.id}`,
      `- Project: ${session.projectPath}`,
      `- Status: ${session.status}`,
      `- Created: ${session.createdAt}`,
      `- Updated: ${session.updatedAt}`,
      '',
      '## Agent',
      '',
      `- Adapter: ${context.adapterInfo?.label ?? 'Unknown'}`,
      `- Profile: ${context.adapterInfo?.profileId ?? 'unknown'}`,
      `- Command: ${context.adapterInfo?.command ?? 'local'}`,
      '',
      '## Messages',
      '',
      ...messages.map((message) => `### ${message.role}\n\n${message.text}`),
    ].join('\n')
  }

  close(): void {
    this.db.close()
  }

  private getGroup(id: string): SessionGroupRecord | null {
    const row = this.db.prepare('SELECT * FROM session_groups WHERE id = ?').get(id) as SessionGroupRow | undefined
    return row ? toGroup(row) : null
  }

  private generateTitleFromFirstRequest(sessionId: string): void {
    const session = this.get(sessionId)
    if (!session || session.title !== (path.basename(session.projectPath) || 'Untitled Project')) return
    const firstUser = this.db.prepare(`
      SELECT text FROM messages WHERE session_id = ? AND role = 'user' ORDER BY timestamp ASC, rowid ASC LIMIT 1
    `).get(sessionId) as { text: string } | undefined
    const title = firstUser?.text.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (title) this.updateMetadata(sessionId, { title })
  }

  private ensureSessionColumns(): void {
    const columns = new Set((this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map((row) => row.name))
    const migrations = [
      ['is_favorite', 'ALTER TABLE sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0'],
      ['is_unread', 'ALTER TABLE sessions ADD COLUMN is_unread INTEGER NOT NULL DEFAULT 0'],
      ['tags_json', "ALTER TABLE sessions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'"],
      ['group_id', 'ALTER TABLE sessions ADD COLUMN group_id TEXT'],
      ['deleted_at', 'ALTER TABLE sessions ADD COLUMN deleted_at TEXT'],
    ] as const
    for (const [column, statement] of migrations) {
      if (!columns.has(column)) this.db.exec(statement)
    }
  }

  private rebuildSearchIndex(): void {
    this.db.exec('DELETE FROM session_search')
    const sessions = this.db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>
    for (const session of sessions) this.updateSearchIndex(session.id)
  }

  private updateSearchIndex(sessionId: string): void {
    const session = this.get(sessionId)
    this.db.prepare('DELETE FROM session_search WHERE session_id = ?').run(sessionId)
    if (!session) return
    const content = this.listMessages(sessionId).map((message) => message.text).join('\n')
    this.db.prepare('INSERT INTO session_search (session_id, title, content) VALUES (?, ?, ?)')
      .run(sessionId, session.title, content)
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20)
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string') ? normalizeTags(parsed) : []
  } catch {
    return []
  }
}
