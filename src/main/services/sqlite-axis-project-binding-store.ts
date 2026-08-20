import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  AxisProjectBindingSchema,
  AxisProjectBindRequestSchema,
  type AxisProjectBinding,
  type AxisProjectBindRequest,
} from '../../shared/axis-project-binding-contracts'
import type {
  AxisProjectBindingAdminPort,
  AxisProjectBindingPortFactory,
  AxisProjectBindingReaderPort,
} from './axis-project-binding-ports'
import { resolvePathWithinRoot } from './file-system'

interface AxisProjectRow {
  created_at: string
  project_id: string
  project_root: string
}

interface AxisProjectBindingRow extends AxisProjectRow {
  bound_at: string
  session_id: string
}

export class SqliteAxisProjectBindingStore
implements AxisProjectBindingAdminPort, AxisProjectBindingPortFactory {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(
    databasePath = ':memory:',
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(databasePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_projects (
        project_id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        project_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS axis_session_project_bindings (
        session_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES axis_projects(project_id),
        bound_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_session_project_bindings_project
        ON axis_session_project_bindings(project_id, session_id);
    `)
  }

  openReaderPort(): AxisProjectBindingReaderPort {
    return Object.freeze({
      findBySession: (sessionId: string) => this.findBySession(sessionId),
    })
  }

  async bind(requestInput: AxisProjectBindRequest): Promise<AxisProjectBinding> {
    const request = AxisProjectBindRequestSchema.parse(requestInput)
    if (!path.isAbsolute(request.projectRoot)) {
      throw new Error('Axis project binding requires an absolute project root')
    }
    const projectRoot = await resolvePathWithinRoot(request.projectRoot, request.projectRoot)
    const projectStats = await stat(projectRoot)
    if (!projectStats.isDirectory()) {
      throw new Error('Axis project binding requires a project directory')
    }
    const projectKey = canonicalProjectKey(projectRoot)

    return this.db.transaction(() => {
      const existing = this.findBySession(request.sessionId)
      if (existing) {
        if (canonicalProjectKey(existing.projectRoot) !== projectKey) {
          throw new Error(`Axis session project binding is immutable: ${request.sessionId} is already bound`)
        }
        return existing
      }

      const timestamp = this.clock().toISOString()
      let project = this.findProjectByKey(projectKey)
      if (!project) {
        this.db.prepare(`
          INSERT OR IGNORE INTO axis_projects (
            project_id, project_root, project_key, created_at
          ) VALUES (?, ?, ?, ?)
        `).run(`axis-project-${randomUUID()}`, projectRoot, projectKey, timestamp)
        project = this.findProjectByKey(projectKey)
      }
      if (!project) throw new Error('Axis project identity could not be persisted')

      this.db.prepare(`
        INSERT INTO axis_session_project_bindings (session_id, project_id, bound_at)
        VALUES (?, ?, ?)
      `).run(request.sessionId, project.project_id, timestamp)
      return AxisProjectBindingSchema.parse({
        boundAt: timestamp,
        projectId: project.project_id,
        projectRoot: project.project_root,
        schemaVersion: 1,
        sessionId: request.sessionId,
      })
    })()
  }

  unbindSession(sessionIdInput: string): boolean {
    const sessionId = AxisProjectBindRequestSchema.shape.sessionId.parse(sessionIdInput)
    return this.db.prepare(
      'DELETE FROM axis_session_project_bindings WHERE session_id = ?',
    ).run(sessionId).changes === 1
  }

  close(): void {
    this.db.close()
  }

  private findBySession(sessionIdInput: string): AxisProjectBinding | null {
    const sessionId = AxisProjectBindRequestSchema.shape.sessionId.parse(sessionIdInput)
    const row = this.db.prepare(`
      SELECT
        bindings.session_id,
        bindings.bound_at,
        projects.project_id,
        projects.project_root,
        projects.created_at
      FROM axis_session_project_bindings AS bindings
      JOIN axis_projects AS projects ON projects.project_id = bindings.project_id
      WHERE bindings.session_id = ?
    `).get(sessionId) as AxisProjectBindingRow | undefined
    return row ? parseBindingRow(row) : null
  }

  private findProjectByKey(projectKey: string): AxisProjectRow | null {
    const row = this.db.prepare(`
      SELECT project_id, project_root, created_at
      FROM axis_projects WHERE project_key = ?
    `).get(projectKey) as AxisProjectRow | undefined
    return row ?? null
  }
}

function canonicalProjectKey(projectRoot: string): string {
  const normalized = path.normalize(projectRoot)
  return process.platform === 'win32'
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
}

function parseBindingRow(row: AxisProjectBindingRow): AxisProjectBinding {
  return AxisProjectBindingSchema.parse({
    boundAt: row.bound_at,
    projectId: row.project_id,
    projectRoot: row.project_root,
    schemaVersion: 1,
    sessionId: row.session_id,
  })
}
