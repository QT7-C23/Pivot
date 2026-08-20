import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisPivotGuardedContinuationAttemptSchema,
  type AxisPivotGuardedContinuationAttempt,
} from '../../shared/axis-pivot-guarded-continuation-contracts'
import type {
  AxisPivotContinuationAttemptBeginInput,
  AxisPivotContinuationAttemptBeginResult,
  AxisPivotContinuationAttemptPort,
  AxisPivotContinuationAttemptTransition,
} from './axis-pivot-guarded-continuation-ports'

const SCHEMA_VERSION = 1
const RECOVERY_ERROR = 'Guarded continuation submission was interrupted; manual reconciliation is required'

interface AttemptRow {
  attempt_json: string
  revision: number
}

export class AxisPivotContinuationAttemptRegistry
implements AxisPivotContinuationAttemptPort {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(
    databasePath = ':memory:',
    options: {
      clock?: () => Date
      idFactory?: () => string
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory
      ?? (() => `pivot-continuation-attempt-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_continuation_attempt_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO axis_pivot_continuation_attempt_schema (
        singleton, version
      ) VALUES (1, ${SCHEMA_VERSION});
      CREATE TABLE IF NOT EXISTS axis_pivot_continuation_attempts (
        attempt_id TEXT PRIMARY KEY,
        handoff_id TEXT NOT NULL,
        request_sha256 TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        attempt_json TEXT NOT NULL,
        UNIQUE (handoff_id, request_sha256)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_continuation_attempt_session
        ON axis_pivot_continuation_attempts(session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_continuation_attempt_recovery
        ON axis_pivot_continuation_attempts(status, updated_at ASC);
    `)
    const schema = this.db.prepare(`
      SELECT version FROM axis_pivot_continuation_attempt_schema
      WHERE singleton = 1
    `).get() as { version: number } | undefined
    if (schema?.version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(
        `Unsupported Axis Pivot continuation attempt schema: ${schema?.version ?? 'missing'}`,
      )
    }
  }

  begin(
    input: AxisPivotContinuationAttemptBeginInput,
  ): AxisPivotContinuationAttemptBeginResult {
    const existing = this.findByRequest(input.handoffId, input.requestSha256)
    if (existing) {
      requireSameBegin(existing, input)
      return { attempt: existing, created: false }
    }
    const timestamp = this.clock().toISOString()
    const attempt = AxisPivotGuardedContinuationAttemptSchema.parse({
      ...input,
      attemptId: this.idFactory(),
      createdAt: timestamp,
      error: null,
      guardedResult: null,
      revision: 1,
      schemaVersion: 1,
      status: 'submitting',
      updatedAt: timestamp,
    })
    try {
      this.db.prepare(`
        INSERT INTO axis_pivot_continuation_attempts (
          attempt_id, handoff_id, request_sha256, session_id,
          status, revision, updated_at, attempt_json
        ) VALUES (
          @attemptId, @handoffId, @requestSha256, @sessionId,
          @status, @revision, @updatedAt, @attemptJson
        )
      `).run(rowInput(attempt))
      return { attempt, created: true }
    } catch (error) {
      const concurrent = this.findByRequest(input.handoffId, input.requestSha256)
      if (concurrent) {
        requireSameBegin(concurrent, input)
        return { attempt: concurrent, created: false }
      }
      throw error
    }
  }

  complete(
    input: AxisPivotContinuationAttemptTransition & {
      result: Parameters<AxisPivotContinuationAttemptPort['complete']>[0]['result']
    },
  ): AxisPivotGuardedContinuationAttempt {
    return this.transition(input, {
      error: null,
      guardedResult: input.result,
      status: 'completed',
    })
  }

  fail(
    input: AxisPivotContinuationAttemptTransition & { error: string },
  ): AxisPivotGuardedContinuationAttempt {
    return this.transition(input, {
      error: input.error,
      guardedResult: null,
      status: 'failed',
    })
  }

  findByRequest(
    handoffId: string,
    requestSha256: string,
  ): AxisPivotGuardedContinuationAttempt | null {
    const row = this.db.prepare(`
      SELECT revision, attempt_json FROM axis_pivot_continuation_attempts
      WHERE handoff_id = ? AND request_sha256 = ?
    `).get(handoffId, requestSha256) as AttemptRow | undefined
    return row ? parseRow(row) : null
  }

  listForHandoff(handoffId: string): AxisPivotGuardedContinuationAttempt[] {
    return (this.db.prepare(`
      SELECT revision, attempt_json FROM axis_pivot_continuation_attempts
      WHERE handoff_id = ? ORDER BY updated_at ASC, attempt_id ASC
    `).all(handoffId) as AttemptRow[]).map(parseRow)
  }

  recoverInterrupted(): AxisPivotGuardedContinuationAttempt[] {
    return this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT revision, attempt_json FROM axis_pivot_continuation_attempts
        WHERE status = 'submitting'
        ORDER BY updated_at ASC, attempt_id ASC
      `).all() as AttemptRow[]
      return rows.map((row) => {
        const attempt = parseRow(row)
        return this.transition({
          attemptId: attempt.attemptId,
          expectedRevision: attempt.revision,
        }, {
          error: RECOVERY_ERROR,
          guardedResult: null,
          status: 'recovery-required',
        })
      })
    })()
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_pivot_continuation_attempts WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }

  private transition(
    input: AxisPivotContinuationAttemptTransition,
    patch: Pick<
      AxisPivotGuardedContinuationAttempt,
      'error' | 'guardedResult' | 'status'
    >,
  ): AxisPivotGuardedContinuationAttempt {
    return this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT revision, attempt_json FROM axis_pivot_continuation_attempts
        WHERE attempt_id = ?
      `).get(input.attemptId) as AttemptRow | undefined
      if (!row) {
        throw new Error(
          `Axis Pivot continuation attempt not found: ${input.attemptId}`,
        )
      }
      const current = parseRow(row)
      if (current.revision !== input.expectedRevision) {
        throw new Error(
          `Axis Pivot continuation attempt revision conflict: expected ${input.expectedRevision}, current ${current.revision}`,
        )
      }
      if (current.status !== 'submitting') {
        throw new Error(
          `Axis Pivot continuation attempt status conflict: ${current.status}`,
        )
      }
      const timestamp = new Date(Math.max(
        this.clock().getTime(),
        Date.parse(current.updatedAt) + 1,
      )).toISOString()
      const next = AxisPivotGuardedContinuationAttemptSchema.parse({
        ...current,
        ...patch,
        revision: current.revision + 1,
        updatedAt: timestamp,
      })
      const update = this.db.prepare(`
        UPDATE axis_pivot_continuation_attempts SET
          status = @status,
          revision = @revision,
          updated_at = @updatedAt,
          attempt_json = @attemptJson
        WHERE attempt_id = @attemptId
          AND revision = @expectedRevision
          AND status = 'submitting'
      `).run({
        ...rowInput(next),
        expectedRevision: input.expectedRevision,
      })
      if (update.changes !== 1) {
        throw new Error(
          `Axis Pivot continuation attempt revision conflict: ${input.attemptId}`,
        )
      }
      return next
    })()
  }
}

function rowInput(
  attempt: AxisPivotGuardedContinuationAttempt,
): Record<string, number | string> {
  return {
    attemptId: attempt.attemptId,
    attemptJson: JSON.stringify(attempt),
    handoffId: attempt.handoffId,
    requestSha256: attempt.requestSha256,
    revision: attempt.revision,
    sessionId: attempt.sessionId,
    status: attempt.status,
    updatedAt: attempt.updatedAt,
  }
}

function parseRow(row: AttemptRow): AxisPivotGuardedContinuationAttempt {
  const attempt = AxisPivotGuardedContinuationAttemptSchema.parse(
    JSON.parse(row.attempt_json) as unknown,
  )
  if (attempt.revision !== row.revision) {
    throw new Error(
      `Axis Pivot continuation attempt revision mismatch: ${attempt.attemptId}`,
    )
  }
  return attempt
}

function requireSameBegin(
  attempt: AxisPivotGuardedContinuationAttempt,
  input: AxisPivotContinuationAttemptBeginInput,
): void {
  for (const key of Object.keys(input) as Array<keyof typeof input>) {
    if (attempt[key] !== input[key]) {
      throw new Error(
        'Axis Pivot continuation attempt request ownership conflict',
      )
    }
  }
}
