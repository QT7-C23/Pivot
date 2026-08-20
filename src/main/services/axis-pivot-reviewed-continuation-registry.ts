import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisPivotReviewedContinuationOrchestrationSchema,
  type AxisPivotReviewedContinuationOrchestration,
} from '../../shared/axis-pivot-reviewed-continuation-contracts'
import type {
  AxisPivotReviewedContinuationAttemptPort,
  AxisPivotReviewedContinuationBeginInput,
  AxisPivotReviewedContinuationBeginResult,
  AxisPivotReviewedContinuationTransition,
} from './axis-pivot-reviewed-continuation-ports'

const SCHEMA_VERSION = 1
const RECOVERY_ERROR = 'Reviewed continuation orchestration was interrupted; manual reconciliation is required'

interface OrchestrationRow {
  orchestration_json: string
  revision: number
}

export class AxisPivotReviewedContinuationRegistry
implements AxisPivotReviewedContinuationAttemptPort {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(
    databasePath = ':memory:',
    options: { clock?: () => Date; idFactory?: () => string } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory
      ?? (() => `pivot-reviewed-continuation-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_reviewed_continuation_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO axis_pivot_reviewed_continuation_schema (
        singleton, version
      ) VALUES (1, ${SCHEMA_VERSION});
      CREATE TABLE IF NOT EXISTS axis_pivot_reviewed_continuations (
        orchestration_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        orchestration_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_reviewed_continuation_session
        ON axis_pivot_reviewed_continuations(session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_reviewed_continuation_recovery
        ON axis_pivot_reviewed_continuations(status, updated_at ASC);
    `)
    const schema = this.db.prepare(`
      SELECT version FROM axis_pivot_reviewed_continuation_schema
      WHERE singleton = 1
    `).get() as { version: number } | undefined
    if (schema?.version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(
        `Unsupported Axis Pivot reviewed continuation schema: ${schema?.version ?? 'missing'}`,
      )
    }
  }

  begin(
    input: AxisPivotReviewedContinuationBeginInput,
  ): AxisPivotReviewedContinuationBeginResult {
    const existing = this.findByDecision(input.decisionId)
    if (existing) {
      requireSameBegin(existing, input)
      return { created: false, orchestration: existing }
    }
    const timestamp = this.clock().toISOString()
    const orchestration = AxisPivotReviewedContinuationOrchestrationSchema.parse({
      ...input,
      continuationAttempt: null,
      createdAt: timestamp,
      error: null,
      orchestrationId: this.idFactory(),
      proposalResult: null,
      revision: 1,
      schemaVersion: 1,
      status: 'preparing',
      updatedAt: timestamp,
    })
    try {
      this.db.prepare(`
        INSERT INTO axis_pivot_reviewed_continuations (
          orchestration_id, decision_id, session_id, status,
          revision, updated_at, orchestration_json
        ) VALUES (
          @orchestrationId, @decisionId, @sessionId, @status,
          @revision, @updatedAt, @orchestrationJson
        )
      `).run(rowInput(orchestration))
      return { created: true, orchestration }
    } catch (error) {
      const concurrent = this.findByDecision(input.decisionId)
      if (concurrent) {
        requireSameBegin(concurrent, input)
        return { created: false, orchestration: concurrent }
      }
      throw error
    }
  }

  markSubmitting(
    input: AxisPivotReviewedContinuationTransition & {
      proposalResult: Parameters<AxisPivotReviewedContinuationAttemptPort['markSubmitting']>[0]['proposalResult']
    },
  ): AxisPivotReviewedContinuationOrchestration {
    return this.transition(input, ['preparing'], {
      continuationAttempt: null,
      error: null,
      proposalResult: input.proposalResult,
      status: 'submitting',
    })
  }

  complete(
    input: AxisPivotReviewedContinuationTransition & {
      continuationAttempt: Parameters<AxisPivotReviewedContinuationAttemptPort['complete']>[0]['continuationAttempt']
    },
  ): AxisPivotReviewedContinuationOrchestration {
    return this.transition(input, ['submitting'], {
      continuationAttempt: input.continuationAttempt,
      error: null,
      status: 'completed',
    })
  }

  fail(
    input: AxisPivotReviewedContinuationTransition & { error: string },
  ): AxisPivotReviewedContinuationOrchestration {
    return this.transition(input, ['preparing', 'submitting'], {
      continuationAttempt: null,
      error: input.error,
      status: 'failed',
    })
  }

  findByDecision(
    decisionId: string,
  ): AxisPivotReviewedContinuationOrchestration | null {
    const row = this.db.prepare(`
      SELECT revision, orchestration_json
      FROM axis_pivot_reviewed_continuations WHERE decision_id = ?
    `).get(decisionId) as OrchestrationRow | undefined
    return row ? parseRow(row) : null
  }

  recoverInterrupted(): AxisPivotReviewedContinuationOrchestration[] {
    return this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT revision, orchestration_json
        FROM axis_pivot_reviewed_continuations
        WHERE status IN ('preparing', 'submitting')
        ORDER BY updated_at ASC, orchestration_id ASC
      `).all() as OrchestrationRow[]
      return rows.map((row) => {
        const orchestration = parseRow(row)
        return this.transition({
          expectedRevision: orchestration.revision,
          orchestrationId: orchestration.orchestrationId,
        }, ['preparing', 'submitting'], {
          continuationAttempt: null,
          error: RECOVERY_ERROR,
          status: 'recovery-required',
        })
      })
    })()
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_pivot_reviewed_continuations WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }

  private transition(
    input: AxisPivotReviewedContinuationTransition,
    allowedStatuses: AxisPivotReviewedContinuationOrchestration['status'][],
    patch: Partial<Pick<
      AxisPivotReviewedContinuationOrchestration,
      'continuationAttempt' | 'error' | 'proposalResult' | 'status'
    >>,
  ): AxisPivotReviewedContinuationOrchestration {
    return this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT revision, orchestration_json
        FROM axis_pivot_reviewed_continuations WHERE orchestration_id = ?
      `).get(input.orchestrationId) as OrchestrationRow | undefined
      if (!row) {
        throw new Error(
          `Axis Pivot reviewed continuation not found: ${input.orchestrationId}`,
        )
      }
      const current = parseRow(row)
      if (current.revision !== input.expectedRevision) {
        throw new Error(
          `Axis Pivot reviewed continuation revision conflict: expected ${input.expectedRevision}, current ${current.revision}`,
        )
      }
      if (!allowedStatuses.includes(current.status)) {
        throw new Error(
          `Axis Pivot reviewed continuation status conflict: ${current.status}`,
        )
      }
      const timestamp = new Date(Math.max(
        this.clock().getTime(),
        Date.parse(current.updatedAt) + 1,
      )).toISOString()
      const next = AxisPivotReviewedContinuationOrchestrationSchema.parse({
        ...current,
        ...patch,
        revision: current.revision + 1,
        updatedAt: timestamp,
      })
      const update = this.db.prepare(`
        UPDATE axis_pivot_reviewed_continuations SET
          status = @status,
          revision = @revision,
          updated_at = @updatedAt,
          orchestration_json = @orchestrationJson
        WHERE orchestration_id = @orchestrationId
          AND revision = @expectedRevision
          AND status = @expectedStatus
      `).run({
        ...rowInput(next),
        expectedRevision: input.expectedRevision,
        expectedStatus: current.status,
      })
      if (update.changes !== 1) {
        throw new Error(
          `Axis Pivot reviewed continuation revision conflict: ${input.orchestrationId}`,
        )
      }
      return next
    })()
  }
}

function rowInput(
  orchestration: AxisPivotReviewedContinuationOrchestration,
): Record<string, number | string> {
  return {
    decisionId: orchestration.decisionId,
    orchestrationId: orchestration.orchestrationId,
    orchestrationJson: JSON.stringify(orchestration),
    revision: orchestration.revision,
    sessionId: orchestration.sessionId,
    status: orchestration.status,
    updatedAt: orchestration.updatedAt,
  }
}

function parseRow(
  row: OrchestrationRow,
): AxisPivotReviewedContinuationOrchestration {
  const orchestration = AxisPivotReviewedContinuationOrchestrationSchema.parse(
    JSON.parse(row.orchestration_json) as unknown,
  )
  if (orchestration.revision !== row.revision) {
    throw new Error(
      `Axis Pivot reviewed continuation revision mismatch: ${orchestration.orchestrationId}`,
    )
  }
  return orchestration
}

function requireSameBegin(
  orchestration: AxisPivotReviewedContinuationOrchestration,
  input: AxisPivotReviewedContinuationBeginInput,
): void {
  for (const key of Object.keys(input) as Array<keyof typeof input>) {
    if (orchestration[key] !== input[key]) {
      throw new Error('Axis Pivot reviewed continuation ownership conflict')
    }
  }
}
