import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  AxisDedicatedFixerAssignmentCreateInputSchema,
  AxisDedicatedFixerAssignmentSchema,
  type AxisDedicatedFixerAssignment,
  type AxisDedicatedFixerAssignmentCreateInput,
} from '../../shared/axis-dedicated-fixer-contracts'
import {
  AxisWorkerAttemptBindingSchema,
} from '../../shared/axis-worker-attempt-contracts'
import type {
  AxisDedicatedFixerAssignmentPort,
} from './axis-dedicated-fixer-ports'
import type {
  AxisWorkerAttemptReaderPort,
} from './axis-worker-attempt-ports'

interface AssignmentRow {
  assignment_json: string
}

const DecisionIdSchema = z.string().trim().min(1).max(160)

export class AxisDedicatedFixerAssignmentRegistry {
  private readonly attempts: AxisWorkerAttemptReaderPort
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(
    databasePath = ':memory:',
    options: {
      attempts: AxisWorkerAttemptReaderPort
      clock?: () => Date
      idFactory?: () => string
    },
  ) {
    this.attempts = options.attempts
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory
      ?? (() => `fixer-assignment-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_dedicated_fixer_assignments (
        assignment_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        source_attempt_id TEXT NOT NULL,
        source_worker_id TEXT NOT NULL,
        fixer_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        assignment_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_dedicated_fixer_assignment_owner
        ON axis_dedicated_fixer_assignments(run_id, session_id, task_id);
    `)
  }

  openAssignmentPort(): AxisDedicatedFixerAssignmentPort {
    const port: AxisDedicatedFixerAssignmentPort = {
      assign: (input) => this.assign(input),
      findByDecision: (decisionId) => this.findByDecision(decisionId),
    }
    return Object.freeze(port)
  }

  assign(
    inputValue: AxisDedicatedFixerAssignmentCreateInput,
  ): AxisDedicatedFixerAssignment {
    const input = AxisDedicatedFixerAssignmentCreateInputSchema.parse(inputValue)
    return this.db.transaction(() => {
      if (this.findByDecision(input.decisionId)) {
        throw new Error(
          `Axis dedicated Fixer decision already assigned: ${input.decisionId}`,
        )
      }
      const foundAttempt = this.attempts.findLatest({
        runId: input.runId,
        sessionId: input.sessionId,
        taskId: input.taskId,
      })
      if (!foundAttempt) {
        throw new Error(
          `Axis dedicated Fixer source attempt not found: ${input.sourceAttemptId}`,
        )
      }
      const attempt = AxisWorkerAttemptBindingSchema.parse(foundAttempt)
      if (
        attempt.attemptId !== input.sourceAttemptId
        || attempt.attempt !== input.sourceAttempt
        || attempt.workerId !== input.sourceWorkerId
        || attempt.runId !== input.runId
        || attempt.sessionId !== input.sessionId
        || attempt.taskId !== input.taskId
      ) {
        throw new Error(
          'Axis dedicated Fixer source attempt ownership mismatch',
        )
      }
      if (attempt.status !== 'failed') {
        throw new Error(
          `Axis dedicated Fixer assignment requires a failed attempt, received ${attempt.status}`,
        )
      }
      const assignment = AxisDedicatedFixerAssignmentSchema.parse({
        ...input,
        assignmentId: this.idFactory(),
        createdAt: this.clock().toISOString(),
        schemaVersion: 1,
        status: 'assigned',
      })
      this.db.prepare(`
        INSERT INTO axis_dedicated_fixer_assignments (
          assignment_id, decision_id, run_id, session_id, task_id,
          source_attempt_id, source_worker_id, fixer_id, created_at,
          assignment_json
        ) VALUES (
          @assignmentId, @decisionId, @runId, @sessionId, @taskId,
          @sourceAttemptId, @sourceWorkerId, @fixerId, @createdAt,
          @assignmentJson
        )
      `).run({
        assignmentId: assignment.assignmentId,
        assignmentJson: JSON.stringify(assignment),
        createdAt: assignment.createdAt,
        decisionId: assignment.decisionId,
        fixerId: assignment.fixer.fixerId,
        runId: assignment.runId,
        sessionId: assignment.sessionId,
        sourceAttemptId: assignment.sourceAttemptId,
        sourceWorkerId: assignment.sourceWorkerId,
        taskId: assignment.taskId,
      })
      return assignment
    })()
  }

  findByDecision(decisionIdValue: string): AxisDedicatedFixerAssignment | null {
    const decisionId = DecisionIdSchema.parse(decisionIdValue)
    const row = this.db.prepare(`
      SELECT assignment_json FROM axis_dedicated_fixer_assignments
      WHERE decision_id = ?
    `).get(decisionId) as AssignmentRow | undefined
    return row
      ? AxisDedicatedFixerAssignmentSchema.parse(
          JSON.parse(row.assignment_json) as unknown,
        )
      : null
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_dedicated_fixer_assignments WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}
