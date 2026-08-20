import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisPlanLineageSchema,
  AxisPlanningContextSchema,
  BudgetEnvelopeSchema,
  type AxisPlanLineage,
  type BudgetEnvelope,
} from '../../shared/axis-engine-contracts'

interface AxisPlanLineageRow {
  lineage_json: string
}

export interface AxisPlanLineageBeginInput {
  attemptId: string
  budget: BudgetEnvelope
  fileScope: string[]
  generation: number
  objective: string
  parentRunId: string
  rootRunId: string
  sessionId: string
  sourceRevision: number
}

type FailureStatus = 'failed' | 'stale' | 'interrupted'

export class AxisPlanLineageRegistry {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(databasePath = ':memory:', options: { clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_plan_lineages (
        attempt_id TEXT PRIMARY KEY,
        parent_run_id TEXT NOT NULL,
        child_run_id TEXT,
        session_id TEXT NOT NULL,
        source_revision INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        lineage_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_plan_lineages_parent
        ON axis_plan_lineages(parent_run_id, source_revision DESC, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_axis_plan_lineages_child
        ON axis_plan_lineages(child_run_id);
      CREATE INDEX IF NOT EXISTS idx_axis_plan_lineages_pending
        ON axis_plan_lineages(status, updated_at);
    `)
  }

  begin(input: AxisPlanLineageBeginInput): AxisPlanLineage {
    const objective = input.objective.trim()
    const context = AxisPlanningContextSchema.parse({ availableFiles: input.fileScope, constraints: [] })
    const fileScope = [...new Set(context.availableFiles)].sort()
    const now = this.clock().toISOString()
    const lineage = AxisPlanLineageSchema.parse({
      attemptId: input.attemptId,
      budget: BudgetEnvelopeSchema.parse(input.budget),
      childRunId: null,
      createdAt: now,
      error: null,
      fileScope,
      fileScopeDigest: digestJson(fileScope),
      generation: input.generation,
      objective,
      objectiveDigest: digestText(objective),
      parentRunId: input.parentRunId,
      rootRunId: input.rootRunId,
      schemaVersion: 1,
      sessionId: input.sessionId,
      sourceRevision: input.sourceRevision,
      status: 'planning',
      updatedAt: now,
    })

    return this.db.transaction(() => {
      const active = this.db.prepare(`
        SELECT attempt_id FROM axis_plan_lineages
        WHERE parent_run_id = ? AND session_id = ? AND source_revision = ?
          AND status IN ('planning', 'materializing')
        LIMIT 1
      `).get(lineage.parentRunId, lineage.sessionId, lineage.sourceRevision) as { attempt_id: string } | undefined
      if (active) throw new Error(`Axis replan already active for parent revision: ${active.attempt_id}`)
      this.insert(lineage)
      return lineage
    })()
  }

  get(attemptId: string): AxisPlanLineage | null {
    const row = this.db.prepare(`
      SELECT lineage_json FROM axis_plan_lineages WHERE attempt_id = ?
    `).get(attemptId) as AxisPlanLineageRow | undefined
    return row ? parseRow(row) : null
  }

  findCompletedParent(childRunId: string, sessionId: string): AxisPlanLineage | null {
    const row = this.db.prepare(`
      SELECT lineage_json FROM axis_plan_lineages
      WHERE child_run_id = ? AND session_id = ? AND status = 'completed'
      ORDER BY generation DESC, updated_at DESC LIMIT 1
    `).get(childRunId, sessionId) as AxisPlanLineageRow | undefined
    return row ? parseRow(row) : null
  }

  findCompletedForSource(
    parentRunId: string,
    sessionId: string,
    sourceRevision: number,
  ): AxisPlanLineage | null {
    if (!Number.isInteger(sourceRevision) || sourceRevision < 1) {
      throw new Error('Axis plan-lineage source revision must be a positive integer')
    }
    const row = this.db.prepare(`
      SELECT lineage_json FROM axis_plan_lineages
      WHERE parent_run_id = ? AND session_id = ? AND source_revision = ?
        AND status = 'completed'
      ORDER BY updated_at DESC, attempt_id DESC LIMIT 1
    `).get(parentRunId, sessionId, sourceRevision) as AxisPlanLineageRow | undefined
    return row ? parseRow(row) : null
  }

  findLatestForSource(
    parentRunId: string,
    sessionId: string,
    sourceRevision: number,
  ): AxisPlanLineage | null {
    if (!Number.isInteger(sourceRevision) || sourceRevision < 1) {
      throw new Error('Axis plan-lineage source revision must be a positive integer')
    }
    const row = this.db.prepare(`
      SELECT lineage_json FROM axis_plan_lineages
      WHERE parent_run_id = ? AND session_id = ? AND source_revision = ?
      ORDER BY updated_at DESC, attempt_id DESC LIMIT 1
    `).get(parentRunId, sessionId, sourceRevision) as AxisPlanLineageRow | undefined
    return row ? parseRow(row) : null
  }

  listForParent(parentRunId: string, limit = 20): AxisPlanLineage[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Axis plan-lineage limit must be between 1 and 100')
    return (this.db.prepare(`
      SELECT lineage_json FROM axis_plan_lineages
      WHERE parent_run_id = ? ORDER BY updated_at DESC, attempt_id DESC LIMIT ?
    `).all(parentRunId, limit) as AxisPlanLineageRow[]).map(parseRow)
  }

  listPending(): AxisPlanLineage[] {
    return (this.db.prepare(`
      SELECT lineage_json FROM axis_plan_lineages
      WHERE status IN ('planning', 'materializing')
      ORDER BY updated_at ASC, attempt_id ASC
    `).all() as AxisPlanLineageRow[]).map(parseRow)
  }

  markMaterializing(attemptId: string, childRunId: string): AxisPlanLineage {
    return this.transition(attemptId, ['planning'], (lineage, now) => ({
      ...lineage,
      childRunId,
      status: 'materializing',
      updatedAt: now,
    }))
  }

  complete(attemptId: string): AxisPlanLineage {
    return this.transition(attemptId, ['materializing'], (lineage, now) => ({
      ...lineage,
      error: null,
      status: 'completed',
      updatedAt: now,
    }))
  }

  markFailed(attemptId: string, error: string): AxisPlanLineage {
    return this.markFailure(attemptId, 'failed', error, ['planning'])
  }

  markStale(attemptId: string, error: string): AxisPlanLineage {
    return this.markFailure(attemptId, 'stale', error, ['materializing'])
  }

  markInterrupted(attemptId: string, error: string): AxisPlanLineage {
    return this.markFailure(attemptId, 'interrupted', error, ['planning', 'materializing'])
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_plan_lineages WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }

  private insert(lineage: AxisPlanLineage): void {
    this.db.prepare(`
      INSERT INTO axis_plan_lineages (
        attempt_id, parent_run_id, child_run_id, session_id, source_revision,
        generation, status, updated_at, lineage_json
      ) VALUES (
        @attemptId, @parentRunId, @childRunId, @sessionId, @sourceRevision,
        @generation, @status, @updatedAt, @lineageJson
      )
    `).run(rowInput(lineage))
  }

  private markFailure(
    attemptId: string,
    status: FailureStatus,
    errorInput: string,
    expectedStatuses: AxisPlanLineage['status'][],
  ): AxisPlanLineage {
    const error = normalizeError(errorInput)
    return this.transition(attemptId, expectedStatuses, (lineage, now) => ({
      ...lineage,
      error,
      status,
      updatedAt: now,
    }))
  }

  private transition(
    attemptId: string,
    expectedStatuses: AxisPlanLineage['status'][],
    mutate: (lineage: AxisPlanLineage, now: string) => AxisPlanLineage,
  ): AxisPlanLineage {
    return this.db.transaction(() => {
      const current = this.get(attemptId)
      if (!current) throw new Error(`Axis plan lineage not found: ${attemptId}`)
      if (!expectedStatuses.includes(current.status)) {
        throw new Error(`Axis plan lineage status conflict: expected ${expectedStatuses.join('/')}, current ${current.status}`)
      }
      const next = AxisPlanLineageSchema.parse(mutate(current, this.clock().toISOString()))
      const update = this.db.prepare(`
        UPDATE axis_plan_lineages SET
          child_run_id = @childRunId,
          status = @status,
          updated_at = @updatedAt,
          lineage_json = @lineageJson
        WHERE attempt_id = @attemptId AND status = @expectedStatus
      `).run({ ...rowInput(next), expectedStatus: current.status })
      if (update.changes !== 1) throw new Error(`Axis plan lineage status conflict: ${attemptId}`)
      return next
    })()
  }
}

function rowInput(lineage: AxisPlanLineage): Record<string, number | string | null> {
  return {
    attemptId: lineage.attemptId,
    childRunId: lineage.childRunId,
    generation: lineage.generation,
    lineageJson: JSON.stringify(lineage),
    parentRunId: lineage.parentRunId,
    sessionId: lineage.sessionId,
    sourceRevision: lineage.sourceRevision,
    status: lineage.status,
    updatedAt: lineage.updatedAt,
  }
}

function parseRow(row: AxisPlanLineageRow): AxisPlanLineage {
  const lineage = AxisPlanLineageSchema.parse(JSON.parse(row.lineage_json) as unknown)
  if (lineage.objectiveDigest !== digestText(lineage.objective)) {
    throw new Error(`Axis plan lineage objective digest mismatch: ${lineage.attemptId}`)
  }
  if (lineage.fileScopeDigest !== digestJson(lineage.fileScope)) {
    throw new Error(`Axis plan lineage file-scope digest mismatch: ${lineage.attemptId}`)
  }
  return lineage
}

function digestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function digestJson(value: unknown): string {
  return digestText(JSON.stringify(value))
}

function normalizeError(value: string): string {
  const normalized = value.trim().slice(0, 16_000)
  return normalized || 'Axis replanning failed'
}
