import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisSelfRepairAssignmentCreateInputSchema,
  AxisSelfRepairAssignmentSchema,
  AxisWorkerAttemptBeginInputSchema,
  AxisWorkerAttemptBindingSchema,
  AxisWorkerAttemptFinishInputSchema,
  AxisWorkerAttemptLookupSchema,
  type AxisSelfRepairAssignment,
  type AxisSelfRepairAssignmentCreateInput,
  type AxisWorkerAttemptBeginInput,
  type AxisWorkerAttemptBinding,
  type AxisWorkerAttemptFinishInput,
  type AxisWorkerAttemptLookup,
} from '../../shared/axis-worker-attempt-contracts'
import type {
  AxisSelfRepairAssignmentPort,
  AxisWorkerAttemptLifecyclePort,
  AxisWorkerAttemptReaderPort,
} from './axis-worker-attempt-ports'

type IdentityKind = 'attempt' | 'assignment'

interface AttemptRow {
  attempt_json: string
}

interface AssignmentRow {
  assignment_json: string
}

export class AxisWorkerAttemptRegistry {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: (kind: IdentityKind) => string

  constructor(
    databasePath = ':memory:',
    options: {
      clock?: () => Date
      idFactory?: (kind: IdentityKind) => string
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory
      ?? ((kind) => `${kind}-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_worker_attempts (
        attempt_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        attempt_json TEXT NOT NULL,
        UNIQUE (run_id, session_id, task_id, attempt)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_worker_attempts_latest
        ON axis_worker_attempts(run_id, session_id, task_id, attempt DESC);
      CREATE TABLE IF NOT EXISTS axis_self_repair_assignments (
        assignment_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        source_attempt_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        assignment_json TEXT NOT NULL,
        FOREIGN KEY (source_attempt_id) REFERENCES axis_worker_attempts(attempt_id)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_self_repair_assignment_owner
        ON axis_self_repair_assignments(run_id, session_id, task_id);
    `)
  }

  openReaderPort(): AxisWorkerAttemptReaderPort {
    const port: AxisWorkerAttemptReaderPort = {
      findLatest: (input) => this.findLatest(input),
    }
    return Object.freeze(port)
  }

  openLifecyclePort(): AxisWorkerAttemptLifecyclePort {
    const port: AxisWorkerAttemptLifecyclePort = {
      begin: (input) => this.begin(input),
      finish: (input) => this.finish(input),
    }
    return Object.freeze(port)
  }

  openAssignmentPort(): AxisSelfRepairAssignmentPort {
    const port: AxisSelfRepairAssignmentPort = {
      assign: (input) => this.assign(input),
      findByDecision: (decisionId) => this.findByDecision(decisionId),
    }
    return Object.freeze(port)
  }

  begin(inputValue: AxisWorkerAttemptBeginInput): AxisWorkerAttemptBinding {
    const input = AxisWorkerAttemptBeginInputSchema.parse(inputValue)
    const now = this.clock().toISOString()
    const attempt = AxisWorkerAttemptBindingSchema.parse({
      ...input,
      attemptId: this.idFactory('attempt'),
      error: null,
      finishedAt: null,
      revision: 1,
      schemaVersion: 1,
      startedAt: now,
      status: 'running',
      updatedAt: now,
    })
    this.db.prepare(`
      INSERT INTO axis_worker_attempts (
        attempt_id, run_id, session_id, task_id, worker_id, attempt,
        revision, status, updated_at, attempt_json
      ) VALUES (
        @attemptId, @runId, @sessionId, @taskId, @workerId, @attempt,
        @revision, @status, @updatedAt, @attemptJson
      )
    `).run(attemptRowInput(attempt))
    return attempt
  }

  findLatest(inputValue: AxisWorkerAttemptLookup): AxisWorkerAttemptBinding | null {
    const input = AxisWorkerAttemptLookupSchema.parse(inputValue)
    const row = this.db.prepare(`
      SELECT attempt_json FROM axis_worker_attempts
      WHERE run_id = ? AND session_id = ? AND task_id = ?
      ORDER BY attempt DESC LIMIT 1
    `).get(input.runId, input.sessionId, input.taskId) as AttemptRow | undefined
    return row ? parseAttemptRow(row) : null
  }

  finish(inputValue: AxisWorkerAttemptFinishInput): AxisWorkerAttemptBinding {
    const input = AxisWorkerAttemptFinishInputSchema.parse(inputValue)
    return this.db.transaction(() => {
      const current = this.findAttempt(input.attemptId)
      if (!current) {
        throw new Error(`Axis Worker attempt not found: ${input.attemptId}`)
      }
      if (
        current.runId !== input.runId
        || current.sessionId !== input.sessionId
        || current.taskId !== input.taskId
        || current.workerId !== input.workerId
      ) {
        throw new Error('Axis Worker attempt finish ownership mismatch')
      }
      if (current.revision !== input.expectedRevision) {
        throw new Error(
          `Axis Worker attempt revision conflict: expected ${input.expectedRevision}, current ${current.revision}`,
        )
      }
      if (current.status !== 'running') {
        throw new Error(
          `Axis Worker attempt status conflict: expected running, current ${current.status}`,
        )
      }
      const now = this.clock().toISOString()
      const next = AxisWorkerAttemptBindingSchema.parse({
        ...current,
        error: input.error,
        finishedAt: now,
        revision: current.revision + 1,
        status: input.status,
        updatedAt: now,
      })
      const update = this.db.prepare(`
        UPDATE axis_worker_attempts SET
          revision = @revision,
          status = @status,
          updated_at = @updatedAt,
          attempt_json = @attemptJson
        WHERE attempt_id = @attemptId
          AND revision = @expectedRevision
          AND status = 'running'
      `).run({
        ...attemptRowInput(next),
        expectedRevision: input.expectedRevision,
      })
      if (update.changes !== 1) {
        throw new Error(`Axis Worker attempt revision conflict: ${input.attemptId}`)
      }
      return next
    })()
  }

  assign(
    inputValue: AxisSelfRepairAssignmentCreateInput,
  ): AxisSelfRepairAssignment {
    const input = AxisSelfRepairAssignmentCreateInputSchema.parse(inputValue)
    return this.db.transaction(() => {
      const existing = this.findByDecision(input.decisionId)
      if (existing) {
        throw new Error(
          `Axis self-repair decision already assigned: ${input.decisionId}`,
        )
      }
      const source = this.findAttempt(input.sourceAttemptId)
      if (!source) {
        throw new Error(
          `Axis self-repair source attempt not found: ${input.sourceAttemptId}`,
        )
      }
      if (
        source.runId !== input.runId
        || source.sessionId !== input.sessionId
        || source.taskId !== input.taskId
        || source.workerId !== input.workerId
        || source.attempt !== input.sourceAttempt
      ) {
        throw new Error('Axis self-repair source attempt ownership mismatch')
      }
      if (source.status !== 'failed') {
        throw new Error(
          `Axis self-repair assignment requires a failed attempt, received ${source.status}`,
        )
      }
      const assignment = AxisSelfRepairAssignmentSchema.parse({
        ...input,
        assignmentId: this.idFactory('assignment'),
        createdAt: this.clock().toISOString(),
        schemaVersion: 1,
        status: 'assigned',
      })
      this.db.prepare(`
        INSERT INTO axis_self_repair_assignments (
          assignment_id, decision_id, run_id, session_id, task_id,
          worker_id, source_attempt_id, created_at, assignment_json
        ) VALUES (
          @assignmentId, @decisionId, @runId, @sessionId, @taskId,
          @workerId, @sourceAttemptId, @createdAt, @assignmentJson
        )
      `).run(assignmentRowInput(assignment))
      return assignment
    })()
  }

  findByDecision(decisionIdValue: string): AxisSelfRepairAssignment | null {
    const decisionId = AxisSelfRepairAssignmentCreateInputSchema.shape.decisionId
      .parse(decisionIdValue)
    const row = this.db.prepare(`
      SELECT assignment_json FROM axis_self_repair_assignments
      WHERE decision_id = ?
    `).get(decisionId) as AssignmentRow | undefined
    return row ? parseAssignmentRow(row) : null
  }

  deleteForSession(sessionId: string): void {
    this.db.transaction(() => {
      this.db.prepare(`
        DELETE FROM axis_self_repair_assignments WHERE session_id = ?
      `).run(sessionId)
      this.db.prepare(`
        DELETE FROM axis_worker_attempts WHERE session_id = ?
      `).run(sessionId)
    })()
  }

  close(): void {
    this.db.close()
  }

  private findAttempt(attemptId: string): AxisWorkerAttemptBinding | null {
    const row = this.db.prepare(`
      SELECT attempt_json FROM axis_worker_attempts WHERE attempt_id = ?
    `).get(attemptId) as AttemptRow | undefined
    return row ? parseAttemptRow(row) : null
  }
}

function attemptRowInput(
  attempt: AxisWorkerAttemptBinding,
): Record<string, number | string> {
  return {
    attempt: attempt.attempt,
    attemptId: attempt.attemptId,
    attemptJson: JSON.stringify(attempt),
    revision: attempt.revision,
    runId: attempt.runId,
    sessionId: attempt.sessionId,
    status: attempt.status,
    taskId: attempt.taskId,
    updatedAt: attempt.updatedAt,
    workerId: attempt.workerId,
  }
}

function assignmentRowInput(
  assignment: AxisSelfRepairAssignment,
): Record<string, string> {
  return {
    assignmentId: assignment.assignmentId,
    assignmentJson: JSON.stringify(assignment),
    createdAt: assignment.createdAt,
    decisionId: assignment.decisionId,
    runId: assignment.runId,
    sessionId: assignment.sessionId,
    sourceAttemptId: assignment.sourceAttemptId,
    taskId: assignment.taskId,
    workerId: assignment.workerId,
  }
}

function parseAttemptRow(row: AttemptRow): AxisWorkerAttemptBinding {
  return AxisWorkerAttemptBindingSchema.parse(
    JSON.parse(row.attempt_json) as unknown,
  )
}

function parseAssignmentRow(row: AssignmentRow): AxisSelfRepairAssignment {
  return AxisSelfRepairAssignmentSchema.parse(
    JSON.parse(row.assignment_json) as unknown,
  )
}
