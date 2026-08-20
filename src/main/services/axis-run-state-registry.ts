import Database from 'better-sqlite3'
import {
  AxisRunStateSchema,
  type AxisCheckpointEvaluation,
  type AxisModelUsage,
  type AxisDryRunApprovalRequest,
  type AxisRunState,
  type AxisPermissionEvaluation,
  type AxisReviewEvaluation,
  type AxisRunStateTransitionRequest,
  type AxisShadowRunResult,
  type BudgetEnvelope,
  type EngineStopReason,
  type PivotDecision,
  type WorkerResult,
} from '../../shared/axis-engine-contracts'
import {
  completeAxisDryRun,
  completeAxisGuardedTask,
  completeAxisTask,
  createAxisRunState,
  pauseAxisRunState,
  recordAxisPivotDecision,
  recordAxisCheckpointEvaluation,
  recordAxisPermissionEvaluation,
  recordAxisReviewEvaluation,
  recordAxisSafeWriteProposalUsage,
  scheduleAxisPivotAssignedTask,
  scheduleAxisPivotTaskRetry,
  stopAxisPivotRun,
  startAxisDryRun,
  startAxisGuardedTask,
  startAxisTask,
  transitionAxisRunState,
} from '../../shared/axis-run-state'
import type { AxisSafeWriteProposalRunStatePort } from './axis-safe-write-proposal-ports'
import type {
  AxisPivotAssignmentStatePort,
  AxisPivotRetryStatePort,
  AxisPivotRunStateReaderPort,
  AxisPivotStopStatePort,
} from './axis-pivot-action-ports'

interface AxisRunStateRow {
  revision: number
  state_json: string
}

export interface AxisTaskStateTransitionRequest extends AxisRunStateTransitionRequest { taskId: string }
export interface AxisTaskCompletionRequest extends AxisRunStateTransitionRequest { result: WorkerResult }
export interface AxisGuardedTaskClaimRequest extends AxisTaskStateTransitionRequest {
  dependencyTaskIds: string[]
}
export interface AxisRunPauseRequest extends AxisRunStateTransitionRequest { stopReason: EngineStopReason }
export interface AxisPermissionEvaluationRequest extends AxisRunStateTransitionRequest { evaluation: AxisPermissionEvaluation }
export interface AxisCheckpointEvaluationRequest extends AxisRunStateTransitionRequest { evaluation: AxisCheckpointEvaluation }
export interface AxisReviewEvaluationRequest extends AxisRunStateTransitionRequest { evaluation: AxisReviewEvaluation }
export interface AxisPivotStateCommitRequest extends AxisRunStateTransitionRequest {
  decision: PivotDecision
  decisionDurationMs: number
  decisionId: string
  modelUsage: AxisModelUsage
}
export interface AxisSafeWriteProposalUsageRequest
extends AxisRunStateTransitionRequest {
  durationMs: number
  taskId: string
  usage: AxisModelUsage
}

export class AxisRunStateRegistry {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(databasePath = ':memory:', options: { clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_run_states (
        run_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        state_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_run_states_session_updated
        ON axis_run_states(session_id, updated_at DESC);
    `)
  }

  create(result: AxisShadowRunResult, budget: BudgetEnvelope): AxisRunState {
    const state = createAxisRunState(result, budget, this.clock().toISOString())
    this.db.prepare(`
      INSERT INTO axis_run_states (run_id, session_id, revision, updated_at, state_json)
      VALUES (@runId, @sessionId, @revision, @updatedAt, @stateJson)
    `).run(rowInput(state))
    return state
  }

  get(runId: string): AxisRunState | null {
    const row = this.db.prepare('SELECT revision, state_json FROM axis_run_states WHERE run_id = ?').get(runId) as AxisRunStateRow | undefined
    return row ? parseRow(row) : null
  }

  openProposalPort(): AxisSafeWriteProposalRunStatePort {
    const port: AxisSafeWriteProposalRunStatePort = {
      find: ({ runId, sessionId }) => {
        const state = this.get(runId)
        return state?.sessionId === sessionId ? state : null
      },
      recordUsage: (request) => this.recordProposalUsage(request),
    }
    return Object.freeze(port)
  }

  openPivotActionReaderPort(): AxisPivotRunStateReaderPort {
    const port: AxisPivotRunStateReaderPort = {
      find: ({ runId, sessionId }) => {
        const state = this.get(runId)
        return state?.sessionId === sessionId ? state : null
      },
    }
    return Object.freeze(port)
  }

  openPivotRetryStatePort(): AxisPivotRetryStatePort {
    const port: AxisPivotRetryStatePort = {
      find: ({ runId, sessionId }) => {
        const state = this.get(runId)
        return state?.sessionId === sessionId ? state : null
      },
      scheduleRetry: (request) => this.schedulePivotRetry(request),
    }
    return Object.freeze(port)
  }

  openPivotAssignmentStatePort(): AxisPivotAssignmentStatePort {
    const port: AxisPivotAssignmentStatePort = {
      find: ({ runId, sessionId }) => {
        const state = this.get(runId)
        return state?.sessionId === sessionId ? state : null
      },
      scheduleAssignment: (request) => this.schedulePivotAssignment(request),
    }
    return Object.freeze(port)
  }

  openPivotStopStatePort(): AxisPivotStopStatePort {
    const port: AxisPivotStopStatePort = {
      find: ({ runId, sessionId }) => {
        const state = this.get(runId)
        return state?.sessionId === sessionId ? state : null
      },
      stopPivot: (request) => this.stopPivot(request),
    }
    return Object.freeze(port)
  }

  recordProposalUsage(request: AxisSafeWriteProposalUsageRequest): AxisRunState {
    return this.update(request, (state, timestamp) => (
      recordAxisSafeWriteProposalUsage(
        state,
        request.taskId,
        request.usage,
        request.durationMs,
        timestamp,
      )
    ))
  }

  list(sessionId: string, limit = 50): AxisRunState[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Axis run-state limit must be between 1 and 100')
    return (this.db.prepare(`
      SELECT revision, state_json FROM axis_run_states
      WHERE session_id = ? ORDER BY updated_at DESC, run_id DESC LIMIT ?
    `).all(sessionId, limit) as AxisRunStateRow[]).map(parseRow)
  }

  cancel(request: AxisRunStateTransitionRequest): AxisRunState {
    return this.update(request, (state, timestamp) => transitionAxisRunState(state, 'cancel', timestamp))
  }

  restart(request: AxisRunStateTransitionRequest): AxisRunState {
    return this.update(request, (state, timestamp) => transitionAxisRunState(state, 'restart', timestamp))
  }

  startDryRun(request: AxisDryRunApprovalRequest): AxisRunState {
    return this.update(request, (state, timestamp) => startAxisDryRun(state, request.approvedTaskIds, timestamp))
  }

  startTask(request: AxisTaskStateTransitionRequest): AxisRunState {
    return this.update(request, (state, timestamp) => startAxisTask(state, request.taskId, timestamp))
  }

  claimGuardedTask(request: AxisGuardedTaskClaimRequest): AxisRunState {
    return this.update(
      request,
      (state, timestamp) => startAxisGuardedTask(
        state,
        request.taskId,
        request.dependencyTaskIds,
        timestamp,
      ),
    )
  }

  recordPermission(request: AxisPermissionEvaluationRequest): AxisRunState {
    return this.update(request, (state, timestamp) => recordAxisPermissionEvaluation(state, request.evaluation, timestamp))
  }

  recordCheckpoint(request: AxisCheckpointEvaluationRequest): AxisRunState {
    return this.update(request, (state, timestamp) => recordAxisCheckpointEvaluation(state, request.evaluation, timestamp))
  }

  recordReview(request: AxisReviewEvaluationRequest): AxisRunState {
    return this.update(request, (state, timestamp) => recordAxisReviewEvaluation(state, request.evaluation, timestamp))
  }

  completeTask(request: AxisTaskCompletionRequest): AxisRunState {
    return this.update(request, (state, timestamp) => completeAxisTask(state, request.result, timestamp))
  }

  finishGuardedTask(request: AxisTaskCompletionRequest): AxisRunState {
    return this.update(
      request,
      (state, timestamp) => completeAxisGuardedTask(
        state,
        request.result,
        timestamp,
      ),
    )
  }

  pause(request: AxisRunPauseRequest): AxisRunState {
    return this.update(request, (state, timestamp) => pauseAxisRunState(state, request.stopReason, timestamp))
  }

  recordPivot(request: AxisPivotStateCommitRequest): AxisRunState {
    return this.update(request, (state, timestamp) => recordAxisPivotDecision(
      state,
      request.decisionId,
      request.decision,
      request.modelUsage,
      request.decisionDurationMs,
      timestamp,
    ))
  }

  schedulePivotRetry(request: {
    decisionId: string
    expectedRevision: number
    runId: string
    sessionId: string
    taskId: string
  }): AxisRunState {
    return this.update(request, (state, timestamp) => scheduleAxisPivotTaskRetry(
      state,
      request.decisionId,
      request.taskId,
      timestamp,
    ))
  }

  schedulePivotAssignment(request: {
    action: 'self-repair' | 'dedicated-fixer'
    decisionId: string
    expectedRevision: number
    runId: string
    sessionId: string
    taskId: string
  }): AxisRunState {
    return this.update(request, (state, timestamp) => scheduleAxisPivotAssignedTask(
      state,
      request.decisionId,
      request.taskId,
      request.action,
      timestamp,
    ))
  }

  stopPivot(request: {
    decisionId: string
    expectedRevision: number
    reason: string
    runId: string
    sessionId: string
    taskId: string | null
  }): AxisRunState {
    return this.update(request, (state, timestamp) => stopAxisPivotRun(
      state,
      request.decisionId,
      request.taskId,
      request.reason,
      timestamp,
    ))
  }

  completeRun(request: AxisRunStateTransitionRequest): AxisRunState {
    return this.update(request, (state, timestamp) => completeAxisDryRun(state, timestamp))
  }

  delete(runId: string, sessionId: string): void {
    this.db.prepare('DELETE FROM axis_run_states WHERE run_id = ? AND session_id = ?').run(runId, sessionId)
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare('DELETE FROM axis_run_states WHERE session_id = ?').run(sessionId)
  }

  close(): void {
    this.db.close()
  }

  private update(
    request: AxisRunStateTransitionRequest,
    transition: (state: AxisRunState, timestamp: string) => AxisRunState,
  ): AxisRunState {
    return this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT revision, state_json FROM axis_run_states WHERE run_id = ? AND session_id = ?
      `).get(request.runId, request.sessionId) as AxisRunStateRow | undefined
      if (!row) throw new Error(`Axis run state not found: ${request.runId}`)
      if (row.revision !== request.expectedRevision) {
        throw new Error(`Axis run state revision conflict: expected ${request.expectedRevision}, current ${row.revision}`)
      }
      const next = transition(parseRow(row), this.clock().toISOString())
      const update = this.db.prepare(`
        UPDATE axis_run_states SET revision = @revision, updated_at = @updatedAt, state_json = @stateJson
        WHERE run_id = @runId AND session_id = @sessionId AND revision = @expectedRevision
      `).run({ ...rowInput(next), expectedRevision: request.expectedRevision })
      if (update.changes !== 1) throw new Error(`Axis run state revision conflict: ${request.runId}`)
      return next
    })()
  }
}

function rowInput(state: AxisRunState): Record<string, number | string> {
  return {
    revision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    stateJson: JSON.stringify(state),
    updatedAt: state.updatedAt,
  }
}

function parseRow(row: AxisRunStateRow): AxisRunState {
  const state = AxisRunStateSchema.parse(JSON.parse(row.state_json) as unknown)
  if (state.revision !== row.revision) throw new Error(`Axis run-state revision mismatch: ${state.runId}`)
  return state
}
