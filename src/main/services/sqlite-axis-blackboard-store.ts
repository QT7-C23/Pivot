import Database from 'better-sqlite3'
import {
  AxisBlackboardBindingSchema,
  AxisBlackboardEvidenceSchema,
  AxisBlackboardEvidenceWriteSchema,
  AxisBlackboardFactSchema,
  AxisBlackboardFactWriteSchema,
  AxisBlackboardRunBindingSchema,
  AxisBlackboardSnapshotSchema,
  AxisBlackboardViewSchema,
  type AxisBlackboardBinding,
  type AxisBlackboardEvidenceWrite,
  type AxisBlackboardFactWrite,
  type AxisBlackboardRunBinding,
  type AxisBlackboardSnapshot,
  type AxisBlackboardView,
} from '../../shared/axis-blackboard-contracts'
import type {
  AxisBlackboardAdminPort,
  AxisBlackboardPortFactory,
  AxisTaskBlackboardPort,
} from './axis-blackboard-ports'

interface AxisBlackboardRow {
  revision: number
  snapshot_json: string
}

export class SqliteAxisBlackboardStore implements AxisBlackboardAdminPort, AxisBlackboardPortFactory {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(databasePath = ':memory:', options: { clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_blackboards (
        run_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_blackboards_session_updated
        ON axis_blackboards(session_id, updated_at DESC);
    `)
  }

  create(bindingInput: AxisBlackboardRunBinding): AxisBlackboardSnapshot {
    const binding = AxisBlackboardRunBindingSchema.parse(bindingInput)
    return this.db.transaction(() => {
      const existing = this.db.prepare(
        'SELECT revision, snapshot_json FROM axis_blackboards WHERE run_id = ?',
      ).get(binding.runId) as AxisBlackboardRow | undefined
      if (existing) throw new Error(`Axis blackboard already exists: ${binding.runId}`)

      const timestamp = this.clock().toISOString()
      const snapshot = AxisBlackboardSnapshotSchema.parse({
        createdAt: timestamp,
        evidence: [],
        facts: [],
        revision: 1,
        runId: binding.runId,
        schemaVersion: 1,
        sessionId: binding.sessionId,
        updatedAt: timestamp,
      })
      this.db.prepare(`
        INSERT INTO axis_blackboards (run_id, session_id, revision, updated_at, snapshot_json)
        VALUES (@runId, @sessionId, @revision, @updatedAt, @snapshotJson)
      `).run(toRowInput(snapshot))
      return snapshot
    })()
  }

  openTaskPort(bindingInput: AxisBlackboardBinding): AxisTaskBlackboardPort {
    const binding = AxisBlackboardBindingSchema.parse(bindingInput)
    return Object.freeze({
      appendEvidence: (request: AxisBlackboardEvidenceWrite) => this.appendEvidence(binding, request),
      appendFact: (request: AxisBlackboardFactWrite) => this.appendFact(binding, request),
      read: () => this.readForTask(binding),
    })
  }

  getFull(bindingInput: AxisBlackboardRunBinding): AxisBlackboardSnapshot | null {
    const binding = AxisBlackboardRunBindingSchema.parse(bindingInput)
    const row = this.selectRow(binding)
    return row ? parseRow(row) : null
  }

  delete(bindingInput: AxisBlackboardRunBinding): void {
    const binding = AxisBlackboardRunBindingSchema.parse(bindingInput)
    this.db.prepare(
      'DELETE FROM axis_blackboards WHERE run_id = ? AND session_id = ?',
    ).run(binding.runId, binding.sessionId)
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare(
      'DELETE FROM axis_blackboards WHERE session_id = ?',
    ).run(sessionId).changes
  }

  close(): void {
    this.db.close()
  }

  private readForTask(binding: AxisBlackboardBinding): AxisBlackboardView {
    const snapshot = this.requireSnapshot(binding)
    return projectForTask(snapshot, binding.taskId)
  }

  private appendFact(
    binding: AxisBlackboardBinding,
    requestInput: AxisBlackboardFactWrite,
  ): AxisBlackboardView {
    const request = AxisBlackboardFactWriteSchema.parse(requestInput)
    return this.update(binding, request.expectedRevision, (snapshot, timestamp) => {
      if (snapshot.facts.some((fact) => fact.factId === request.draft.factId)) {
        throw new Error(`Axis blackboard fact already exists: ${request.draft.factId}`)
      }
      const fact = AxisBlackboardFactSchema.parse({
        ...request.draft,
        createdAt: timestamp,
        ownerTaskId: binding.taskId,
      })
      return { ...snapshot, facts: [...snapshot.facts, fact] }
    })
  }

  private appendEvidence(
    binding: AxisBlackboardBinding,
    requestInput: AxisBlackboardEvidenceWrite,
  ): AxisBlackboardView {
    const request = AxisBlackboardEvidenceWriteSchema.parse(requestInput)
    return this.update(binding, request.expectedRevision, (snapshot, timestamp) => {
      if (snapshot.evidence.some((evidence) => evidence.evidenceId === request.draft.evidenceId)) {
        throw new Error(`Axis blackboard evidence already exists: ${request.draft.evidenceId}`)
      }
      const evidence = AxisBlackboardEvidenceSchema.parse({
        ...request.draft,
        createdAt: timestamp,
        ownerTaskId: binding.taskId,
      })
      return { ...snapshot, evidence: [...snapshot.evidence, evidence] }
    })
  }

  private update(
    binding: AxisBlackboardBinding,
    expectedRevision: number,
    transition: (
      snapshot: AxisBlackboardSnapshot,
      timestamp: string,
    ) => AxisBlackboardSnapshot,
  ): AxisBlackboardView {
    return this.db.transaction(() => {
      const current = this.requireSnapshot(binding)
      if (current.revision !== expectedRevision) {
        throw new Error(
          `Axis blackboard revision conflict: expected ${expectedRevision}, current ${current.revision}`,
        )
      }
      const timestamp = this.clock().toISOString()
      const next = AxisBlackboardSnapshotSchema.parse({
        ...transition(current, timestamp),
        revision: current.revision + 1,
        updatedAt: timestamp,
      })
      const result = this.db.prepare(`
        UPDATE axis_blackboards
        SET revision = @revision, updated_at = @updatedAt, snapshot_json = @snapshotJson
        WHERE run_id = @runId AND session_id = @sessionId AND revision = @expectedRevision
      `).run({ ...toRowInput(next), expectedRevision })
      if (result.changes !== 1) {
        throw new Error(`Axis blackboard revision conflict: ${binding.runId}`)
      }
      return projectForTask(next, binding.taskId)
    })()
  }

  private requireSnapshot(binding: AxisBlackboardBinding): AxisBlackboardSnapshot {
    const row = this.selectRow(binding)
    if (!row) {
      throw new Error(
        `Axis blackboard binding not found: ${binding.runId}/${binding.sessionId}`,
      )
    }
    return parseRow(row)
  }

  private selectRow(binding: AxisBlackboardRunBinding): AxisBlackboardRow | undefined {
    return this.db.prepare(`
      SELECT revision, snapshot_json FROM axis_blackboards
      WHERE run_id = ? AND session_id = ?
    `).get(binding.runId, binding.sessionId) as AxisBlackboardRow | undefined
  }
}

function projectForTask(
  snapshot: AxisBlackboardSnapshot,
  taskId: string,
): AxisBlackboardView {
  return AxisBlackboardViewSchema.parse({
    evidence: snapshot.evidence.filter(
      (item) => item.visibility === 'run' || item.ownerTaskId === taskId,
    ),
    facts: snapshot.facts.filter(
      (item) => item.visibility === 'run' || item.ownerTaskId === taskId,
    ),
    revision: snapshot.revision,
    runId: snapshot.runId,
    schemaVersion: 1,
    sessionId: snapshot.sessionId,
    taskId,
    updatedAt: snapshot.updatedAt,
  })
}

function toRowInput(snapshot: AxisBlackboardSnapshot): Record<string, number | string> {
  return {
    revision: snapshot.revision,
    runId: snapshot.runId,
    sessionId: snapshot.sessionId,
    snapshotJson: JSON.stringify(snapshot),
    updatedAt: snapshot.updatedAt,
  }
}

function parseRow(row: AxisBlackboardRow): AxisBlackboardSnapshot {
  const snapshot = AxisBlackboardSnapshotSchema.parse(
    JSON.parse(row.snapshot_json) as unknown,
  )
  if (snapshot.revision !== row.revision) {
    throw new Error(`Axis blackboard revision mismatch: ${snapshot.runId}`)
  }
  return snapshot
}
