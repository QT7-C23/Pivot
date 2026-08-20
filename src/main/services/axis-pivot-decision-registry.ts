import Database from 'better-sqlite3'
import {
  AxisModelUsageSchema,
  AxisPivotActionSchema,
  AxisPivotDecisionRecordSchema,
  AxisPivotTriggerSchema,
  AxisRunStateSchema,
  PivotDecisionSchema,
  type AxisModelUsage,
  type AxisPivotAction,
  type AxisPivotDecisionRecord,
  type AxisPivotTrigger,
  type AxisRunState,
  type EngineStopReason,
  type PivotDecision,
} from '../../shared/axis-engine-contracts'
import { axisRemainingBudget } from './axis-pivot-policy'
import type { AxisPivotDecisionReaderPort } from './axis-pivot-action-ports'

interface AxisPivotDecisionRow {
  record_json: string
}

export interface AxisPivotDecisionBeginInput {
  allowedActions: AxisPivotAction[]
  decisionId: string
  state: AxisRunState
  trigger: AxisPivotTrigger
}

export interface AxisPivotCommitInput {
  decision: PivotDecision
  decisionDurationMs: number
  forced: boolean
  modelUsage: AxisModelUsage
  proposal: PivotDecision | null
  stopReason: EngineStopReason | null
}

export interface AxisPivotFailureInput {
  decisionDurationMs?: number
  error: string
  modelUsage?: AxisModelUsage
  proposal?: PivotDecision | null
}

export class AxisPivotDecisionRegistry {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(databasePath = ':memory:', options: { clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_pivot_decisions (
        decision_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        source_revision INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_decisions_run
        ON axis_pivot_decisions(run_id, sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_axis_pivot_decisions_pending
        ON axis_pivot_decisions(status, updated_at);
    `)
  }

  begin(input: AxisPivotDecisionBeginInput): AxisPivotDecisionRecord {
    const state = AxisRunStateSchema.parse(input.state)
    if (state.status !== 'failed' && state.status !== 'paused') {
      throw new Error(`Axis Pivot decision requires a failed or paused run, received ${state.status}`)
    }
    const trigger = AxisPivotTriggerSchema.parse(input.trigger)
    const allowedActions = input.allowedActions.map((action) => AxisPivotActionSchema.parse(action))
    return this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT decision_id FROM axis_pivot_decisions
        WHERE run_id = ? AND source_revision = ?
        LIMIT 1
      `).get(state.runId, state.revision) as { decision_id: string } | undefined
      if (existing) throw new Error(`Axis Pivot decision already recorded for run revision: ${existing.decision_id}`)
      const sequenceRow = this.db.prepare(`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
        FROM axis_pivot_decisions WHERE run_id = ?
      `).get(state.runId) as { sequence: number }
      const now = this.clock().toISOString()
      const record = AxisPivotDecisionRecordSchema.parse({
        allowedActions,
        budget: state.budget,
        createdAt: now,
        decision: null,
        decisionDurationMs: 0,
        decisionId: input.decisionId,
        error: null,
        forced: false,
        modelUsage: { costUsd: 0, tokens: 0 },
        objective: state.objective,
        proposal: null,
        remainingBudget: axisRemainingBudget(state.budget, state.usage),
        runId: state.runId,
        schemaVersion: 1,
        sequence: sequenceRow.sequence,
        sessionId: state.sessionId,
        sourceRevision: state.revision,
        sourceStatus: state.status,
        status: 'deciding',
        stopReason: null,
        trigger,
        updatedAt: now,
        usageBefore: state.usage,
      })
      this.insert(record)
      return record
    })()
  }

  get(decisionId: string): AxisPivotDecisionRecord | null {
    const row = this.db.prepare(`
      SELECT record_json FROM axis_pivot_decisions WHERE decision_id = ?
    `).get(decisionId) as AxisPivotDecisionRow | undefined
    return row ? parseRow(row) : null
  }

  findByRunRevision(
    runId: string,
    sourceRevision: number,
  ): AxisPivotDecisionRecord | null {
    const row = this.db.prepare(`
      SELECT record_json FROM axis_pivot_decisions
      WHERE run_id = ? AND source_revision = ?
      LIMIT 1
    `).get(runId, sourceRevision) as AxisPivotDecisionRow | undefined
    return row ? parseRow(row) : null
  }

  openActionReaderPort(): AxisPivotDecisionReaderPort {
    return Object.freeze({
      find: (decisionId: string) => this.get(decisionId),
    })
  }

  listForRun(runId: string, limit = 50): AxisPivotDecisionRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Axis Pivot decision limit must be between 1 and 100')
    return (this.db.prepare(`
      SELECT record_json FROM axis_pivot_decisions
      WHERE run_id = ? ORDER BY sequence DESC LIMIT ?
    `).all(runId, limit) as AxisPivotDecisionRow[]).map(parseRow)
  }

  listPending(): AxisPivotDecisionRecord[] {
    return (this.db.prepare(`
      SELECT record_json FROM axis_pivot_decisions
      WHERE status IN ('deciding', 'committing')
      ORDER BY updated_at ASC, decision_id ASC
    `).all() as AxisPivotDecisionRow[]).map(parseRow)
  }

  listDecided(): AxisPivotDecisionRecord[] {
    return (this.db.prepare(`
      SELECT record_json FROM axis_pivot_decisions
      WHERE status = 'decided'
      ORDER BY updated_at ASC, decision_id ASC
    `).all() as AxisPivotDecisionRow[]).map(parseRow)
  }

  markCommitting(decisionId: string, input: AxisPivotCommitInput): AxisPivotDecisionRecord {
    const decision = PivotDecisionSchema.parse(input.decision)
    const proposal = input.proposal ? PivotDecisionSchema.parse(input.proposal) : null
    const modelUsage = AxisModelUsageSchema.parse(input.modelUsage)
    return this.transition(decisionId, ['deciding'], (record, now) => ({
      ...record,
      decision,
      decisionDurationMs: requireDuration(input.decisionDurationMs),
      forced: input.forced,
      modelUsage,
      proposal,
      status: 'committing',
      stopReason: input.stopReason,
      updatedAt: now,
    }))
  }

  complete(decisionId: string): AxisPivotDecisionRecord {
    return this.transition(decisionId, ['committing'], (record, now) => ({
      ...record,
      status: 'decided',
      updatedAt: now,
    }))
  }

  markFailed(decisionId: string, input: AxisPivotFailureInput): AxisPivotDecisionRecord {
    return this.transition(decisionId, ['deciding'], (record, now) => ({
      ...record,
      decisionDurationMs: requireDuration(input.decisionDurationMs ?? record.decisionDurationMs),
      error: normalizeError(input.error),
      modelUsage: input.modelUsage ? AxisModelUsageSchema.parse(input.modelUsage) : record.modelUsage,
      proposal: input.proposal ? PivotDecisionSchema.parse(input.proposal) : record.proposal,
      status: 'failed',
      updatedAt: now,
    }))
  }

  markStale(decisionId: string, error: string): AxisPivotDecisionRecord {
    return this.markTerminalFailure(decisionId, 'stale', error, ['committing'])
  }

  markInterrupted(decisionId: string, error: string): AxisPivotDecisionRecord {
    return this.markTerminalFailure(decisionId, 'interrupted', error, ['deciding', 'committing'])
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_pivot_decisions WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }

  private insert(record: AxisPivotDecisionRecord): void {
    this.db.prepare(`
      INSERT INTO axis_pivot_decisions (
        decision_id, run_id, session_id, source_revision, sequence, status, updated_at, record_json
      ) VALUES (
        @decisionId, @runId, @sessionId, @sourceRevision, @sequence, @status, @updatedAt, @recordJson
      )
    `).run(rowInput(record))
  }

  private markTerminalFailure(
    decisionId: string,
    status: 'stale' | 'interrupted',
    error: string,
    expectedStatuses: AxisPivotDecisionRecord['status'][],
  ): AxisPivotDecisionRecord {
    return this.transition(decisionId, expectedStatuses, (record, now) => ({
      ...record,
      error: normalizeError(error),
      status,
      updatedAt: now,
    }))
  }

  private transition(
    decisionId: string,
    expectedStatuses: AxisPivotDecisionRecord['status'][],
    mutate: (record: AxisPivotDecisionRecord, now: string) => AxisPivotDecisionRecord,
  ): AxisPivotDecisionRecord {
    return this.db.transaction(() => {
      const current = this.get(decisionId)
      if (!current) throw new Error(`Axis Pivot decision not found: ${decisionId}`)
      if (!expectedStatuses.includes(current.status)) {
        throw new Error(`Axis Pivot decision status conflict: expected ${expectedStatuses.join('/')}, current ${current.status}`)
      }
      const next = AxisPivotDecisionRecordSchema.parse(mutate(current, this.clock().toISOString()))
      const update = this.db.prepare(`
        UPDATE axis_pivot_decisions SET
          status = @status,
          updated_at = @updatedAt,
          record_json = @recordJson
        WHERE decision_id = @decisionId AND status = @expectedStatus
      `).run({ ...rowInput(next), expectedStatus: current.status })
      if (update.changes !== 1) throw new Error(`Axis Pivot decision status conflict: ${decisionId}`)
      return next
    })()
  }
}

function rowInput(record: AxisPivotDecisionRecord): Record<string, number | string> {
  return {
    decisionId: record.decisionId,
    recordJson: JSON.stringify(record),
    runId: record.runId,
    sequence: record.sequence,
    sessionId: record.sessionId,
    sourceRevision: record.sourceRevision,
    status: record.status,
    updatedAt: record.updatedAt,
  }
}

function parseRow(row: AxisPivotDecisionRow): AxisPivotDecisionRecord {
  return AxisPivotDecisionRecordSchema.parse(JSON.parse(row.record_json) as unknown)
}

function normalizeError(value: string): string {
  return value.trim().slice(0, 16_000) || 'Axis Pivot decision failed'
}

function requireDuration(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error('Axis Pivot decision duration must be a non-negative integer')
  return value
}
