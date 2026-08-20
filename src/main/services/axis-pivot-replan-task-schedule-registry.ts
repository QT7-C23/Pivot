import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisPivotReplanTaskScheduleSchema,
  type AxisPivotReplanTaskSchedule,
} from '../../shared/axis-pivot-replan-task-scheduling-contracts'
import type {
  AxisPivotReplanTaskScheduleCreateInput,
  AxisPivotReplanTaskScheduleCreateResult,
  AxisPivotReplanTaskSchedulePort,
} from './axis-pivot-replan-task-scheduling-ports'

const SCHEMA_VERSION = 1

interface ScheduleRow {
  schedule_json: string
}

export class AxisPivotReplanTaskScheduleRegistry
implements AxisPivotReplanTaskSchedulePort {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(
    databasePath = ':memory:',
    options: { clock?: () => Date; idFactory?: () => string } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory
      ?? (() => `pivot-replan-task-schedule-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_replan_task_schedule_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO axis_pivot_replan_task_schedule_schema (
        singleton, version
      ) VALUES (1, ${SCHEMA_VERSION});
      CREATE TABLE IF NOT EXISTS axis_pivot_replan_task_schedules (
        schedule_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        child_state_revision INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        schedule_json TEXT NOT NULL,
        UNIQUE (decision_id, child_state_revision)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_replan_schedule_session
        ON axis_pivot_replan_task_schedules(session_id, created_at DESC);
    `)
    const schema = this.db.prepare(`
      SELECT version FROM axis_pivot_replan_task_schedule_schema
      WHERE singleton = 1
    `).get() as { version: number } | undefined
    if (schema?.version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(
        `Unsupported Axis Pivot replan task schedule schema: ${schema?.version ?? 'missing'}`,
      )
    }
  }

  create(
    input: AxisPivotReplanTaskScheduleCreateInput,
  ): AxisPivotReplanTaskScheduleCreateResult {
    const existing = this.findBySource(
      input.decisionId,
      input.childStateRevision,
    )
    if (existing) {
      requireSameSource(existing, input)
      return { created: false, schedule: existing }
    }
    const schedule = AxisPivotReplanTaskScheduleSchema.parse({
      ...input,
      authority: 'pivot-main-replan-task-scheduler',
      createdAt: this.clock().toISOString(),
      scheduleId: this.idFactory(),
      schemaVersion: 1,
      status: 'scheduled',
    })
    try {
      this.db.prepare(`
        INSERT INTO axis_pivot_replan_task_schedules (
          schedule_id, decision_id, child_state_revision,
          session_id, created_at, schedule_json
        ) VALUES (
          @scheduleId, @decisionId, @childStateRevision,
          @sessionId, @createdAt, @scheduleJson
        )
      `).run(rowInput(schedule))
      return { created: true, schedule }
    } catch (error) {
      const concurrent = this.findBySource(
        input.decisionId,
        input.childStateRevision,
      )
      if (concurrent) {
        requireSameSource(concurrent, input)
        return { created: false, schedule: concurrent }
      }
      throw error
    }
  }

  findBySource(
    decisionId: string,
    childStateRevision: number,
  ): AxisPivotReplanTaskSchedule | null {
    const row = this.db.prepare(`
      SELECT schedule_json FROM axis_pivot_replan_task_schedules
      WHERE decision_id = ? AND child_state_revision = ?
    `).get(decisionId, childStateRevision) as ScheduleRow | undefined
    return row ? parseRow(row) : null
  }

  find(scheduleId: string): AxisPivotReplanTaskSchedule | null {
    const row = this.db.prepare(`
      SELECT schedule_json FROM axis_pivot_replan_task_schedules
      WHERE schedule_id = ?
    `).get(scheduleId) as ScheduleRow | undefined
    return row ? parseRow(row) : null
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_pivot_replan_task_schedules WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}

function rowInput(
  schedule: AxisPivotReplanTaskSchedule,
): Record<string, number | string> {
  return {
    childStateRevision: schedule.childStateRevision,
    createdAt: schedule.createdAt,
    decisionId: schedule.decisionId,
    scheduleId: schedule.scheduleId,
    scheduleJson: JSON.stringify(schedule),
    sessionId: schedule.sessionId,
  }
}

function parseRow(row: ScheduleRow): AxisPivotReplanTaskSchedule {
  return AxisPivotReplanTaskScheduleSchema.parse(
    JSON.parse(row.schedule_json) as unknown,
  )
}

function requireSameSource(
  schedule: AxisPivotReplanTaskSchedule,
  input: AxisPivotReplanTaskScheduleCreateInput,
): void {
  for (const key of Object.keys(input) as Array<keyof typeof input>) {
    if (JSON.stringify(schedule[key]) !== JSON.stringify(input[key])) {
      throw new Error('Axis Pivot replan task schedule ownership conflict')
    }
  }
}
