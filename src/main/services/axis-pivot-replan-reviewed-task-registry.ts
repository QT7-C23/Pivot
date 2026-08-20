import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisPivotReplanReviewedTaskOrchestrationSchema,
  type AxisPivotReplanReviewedTaskOrchestration,
} from '../../shared/axis-pivot-replan-reviewed-task-contracts'
import type {
  AxisPivotReplanReviewedTaskAttemptPort,
  AxisPivotReplanReviewedTaskBeginInput,
  AxisPivotReplanReviewedTaskTransition,
} from './axis-pivot-replan-reviewed-task-ports'

const SCHEMA_VERSION = 1
const RECOVERY_ERROR = 'Replan reviewed-task orchestration was interrupted; manual reconciliation is required'
interface Row { orchestration_json: string; revision: number }

export class AxisPivotReplanReviewedTaskRegistry
implements AxisPivotReplanReviewedTaskAttemptPort {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(databasePath = ':memory:', options: {
    clock?: () => Date
    idFactory?: () => string
  } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => `pivot-replan-reviewed-task-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_replan_reviewed_task_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO axis_pivot_replan_reviewed_task_schema (singleton, version)
      VALUES (1, ${SCHEMA_VERSION});
      CREATE TABLE IF NOT EXISTS axis_pivot_replan_reviewed_tasks (
        orchestration_id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL, orchestration_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_replan_reviewed_task_session
        ON axis_pivot_replan_reviewed_tasks(session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_replan_reviewed_task_recovery
        ON axis_pivot_replan_reviewed_tasks(status, updated_at ASC);
    `)
    const schema = this.db.prepare(`SELECT version FROM axis_pivot_replan_reviewed_task_schema WHERE singleton = 1`).get() as { version: number } | undefined
    if (schema?.version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(`Unsupported Axis Pivot replan reviewed-task schema: ${schema?.version ?? 'missing'}`)
    }
  }

  begin(input: AxisPivotReplanReviewedTaskBeginInput) {
    const existing = this.findBySchedule(input.scheduleId)
    if (existing) {
      requireSameBegin(existing, input)
      return { created: false, orchestration: existing }
    }
    const timestamp = this.clock().toISOString()
    const orchestration = AxisPivotReplanReviewedTaskOrchestrationSchema.parse({
      ...input, action: 'replan', continuationAttempt: null,
      createdAt: timestamp, error: null, orchestrationId: this.idFactory(),
      proposalResult: null, revision: 1, schemaVersion: 1,
      status: 'preparing', updatedAt: timestamp,
    })
    try {
      this.db.prepare(`INSERT INTO axis_pivot_replan_reviewed_tasks (
        orchestration_id, schedule_id, session_id, status, revision, updated_at, orchestration_json
      ) VALUES (@orchestrationId, @scheduleId, @sessionId, @status, @revision, @updatedAt, @orchestrationJson)`).run(rowInput(orchestration))
      return { created: true, orchestration }
    } catch (error) {
      const concurrent = this.findBySchedule(input.scheduleId)
      if (concurrent) {
        requireSameBegin(concurrent, input)
        return { created: false, orchestration: concurrent }
      }
      throw error
    }
  }

  markSubmitting(input: Parameters<AxisPivotReplanReviewedTaskAttemptPort['markSubmitting']>[0]) {
    return this.transition(input, ['preparing'], {
      continuationAttempt: null, error: null,
      proposalResult: input.proposalResult, status: 'submitting',
    })
  }

  complete(input: Parameters<AxisPivotReplanReviewedTaskAttemptPort['complete']>[0]) {
    return this.transition(input, ['submitting'], {
      continuationAttempt: input.continuationAttempt, error: null, status: 'completed',
    })
  }

  fail(input: Parameters<AxisPivotReplanReviewedTaskAttemptPort['fail']>[0]) {
    return this.transition(input, ['preparing', 'submitting'], {
      continuationAttempt: null, error: input.error, status: 'failed',
    })
  }

  findBySchedule(scheduleId: string): AxisPivotReplanReviewedTaskOrchestration | null {
    const row = this.db.prepare(`SELECT revision, orchestration_json FROM axis_pivot_replan_reviewed_tasks WHERE schedule_id = ?`).get(scheduleId) as Row | undefined
    return row ? parseRow(row) : null
  }

  recoverInterrupted(): AxisPivotReplanReviewedTaskOrchestration[] {
    return this.db.transaction(() => (this.db.prepare(`
      SELECT revision, orchestration_json FROM axis_pivot_replan_reviewed_tasks
      WHERE status IN ('preparing', 'submitting') ORDER BY updated_at, orchestration_id
    `).all() as Row[]).map((row) => {
      const current = parseRow(row)
      return this.transition({
        expectedRevision: current.revision,
        orchestrationId: current.orchestrationId,
      }, ['preparing', 'submitting'], {
        continuationAttempt: null, error: RECOVERY_ERROR, status: 'recovery-required',
      })
    }))()
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM axis_pivot_replan_reviewed_tasks WHERE session_id = ?`).run(sessionId)
  }

  close(): void { this.db.close() }

  private transition(
    input: AxisPivotReplanReviewedTaskTransition,
    allowed: AxisPivotReplanReviewedTaskOrchestration['status'][],
    patch: Partial<Pick<AxisPivotReplanReviewedTaskOrchestration,
      'continuationAttempt' | 'error' | 'proposalResult' | 'status'>>,
  ): AxisPivotReplanReviewedTaskOrchestration {
    return this.db.transaction(() => {
      const row = this.db.prepare(`SELECT revision, orchestration_json FROM axis_pivot_replan_reviewed_tasks WHERE orchestration_id = ?`).get(input.orchestrationId) as Row | undefined
      if (!row) throw new Error(`Axis Pivot replan reviewed task not found: ${input.orchestrationId}`)
      const current = parseRow(row)
      if (current.revision !== input.expectedRevision || !allowed.includes(current.status)) {
        throw new Error(`Axis Pivot replan reviewed task revision or status conflict: ${current.revision}/${current.status}`)
      }
      const timestamp = new Date(Math.max(this.clock().getTime(), Date.parse(current.updatedAt) + 1)).toISOString()
      const next = AxisPivotReplanReviewedTaskOrchestrationSchema.parse({
        ...current, ...patch, revision: current.revision + 1, updatedAt: timestamp,
      })
      const update = this.db.prepare(`UPDATE axis_pivot_replan_reviewed_tasks SET
        status=@status, revision=@revision, updated_at=@updatedAt, orchestration_json=@orchestrationJson
        WHERE orchestration_id=@orchestrationId AND revision=@expectedRevision AND status=@expectedStatus`).run({
        ...rowInput(next), expectedRevision: input.expectedRevision, expectedStatus: current.status,
      })
      if (update.changes !== 1) throw new Error(`Axis Pivot replan reviewed task revision conflict: ${input.orchestrationId}`)
      return next
    })()
  }
}

function rowInput(value: AxisPivotReplanReviewedTaskOrchestration): Record<string, number | string> {
  return {
    orchestrationId: value.orchestrationId,
    orchestrationJson: JSON.stringify(value),
    revision: value.revision,
    scheduleId: value.scheduleId,
    sessionId: value.sessionId,
    status: value.status,
    updatedAt: value.updatedAt,
  }
}
function parseRow(row: Row): AxisPivotReplanReviewedTaskOrchestration {
  const value = AxisPivotReplanReviewedTaskOrchestrationSchema.parse(JSON.parse(row.orchestration_json) as unknown)
  if (value.revision !== row.revision) throw new Error(`Axis Pivot replan reviewed task revision mismatch: ${value.orchestrationId}`)
  return value
}
function requireSameBegin(value: AxisPivotReplanReviewedTaskOrchestration, input: AxisPivotReplanReviewedTaskBeginInput): void {
  for (const key of Object.keys(input) as Array<keyof typeof input>) {
    if (value[key] !== input[key]) throw new Error('Axis Pivot replan reviewed task ownership conflict')
  }
}
