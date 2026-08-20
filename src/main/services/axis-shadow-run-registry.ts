import Database from 'better-sqlite3'
import { AxisShadowRunResultSchema, type AxisShadowRunResult, type ComplexityReport } from '../../shared/axis-engine-contracts'
import { requiredAxisGatesForRiskFlags } from './axis-classification-policy'
import type {
  AxisGuardedTaskBinding,
  AxisGuardedTaskReaderPort,
} from './axis-guarded-safe-write-ports'
import type { AxisPivotReplanPlanReaderPort } from './axis-pivot-replan-task-scheduling-ports'

interface ShadowRunRow {
  result_json: string
}

export class AxisShadowRunRegistry {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_shadow_runs (
        run_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        result_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_shadow_runs_session_started
        ON axis_shadow_runs(session_id, started_at DESC);
    `)
  }

  openTaskReaderPort(): AxisGuardedTaskReaderPort {
    return Object.freeze({
      findTask: ({ runId, sessionId, taskId }: AxisGuardedTaskBinding) => {
        const result = this.get(runId)
        if (
          !result
          || result.trace.sessionId !== sessionId
          || result.status !== 'planned'
          || !result.dag
        ) {
          return null
        }
        return result.dag.tasks.find((task) => task.id === taskId) ?? null
      },
    })
  }

  openReplanTaskSchedulingReaderPort(): AxisPivotReplanPlanReaderPort {
    const port: AxisPivotReplanPlanReaderPort = {
      find: ({ runId, sessionId }) => {
        const result = this.get(runId)
        return result?.trace.sessionId === sessionId ? result : null
      },
    }
    return Object.freeze(port)
  }

  save(resultInput: AxisShadowRunResult): AxisShadowRunResult {
    const result = AxisShadowRunResultSchema.parse(resultInput)
    this.db.prepare(`
      INSERT INTO axis_shadow_runs (run_id, session_id, started_at, result_json)
      VALUES (@runId, @sessionId, @startedAt, @resultJson)
      ON CONFLICT(run_id) DO UPDATE SET
        session_id = excluded.session_id,
        started_at = excluded.started_at,
        result_json = excluded.result_json
    `).run({
      resultJson: JSON.stringify(result),
      runId: result.trace.runId,
      sessionId: result.trace.sessionId,
      startedAt: result.trace.startedAt,
    })
    return result
  }

  get(runId: string): AxisShadowRunResult | null {
    const row = this.db.prepare('SELECT result_json FROM axis_shadow_runs WHERE run_id = ?').get(runId) as ShadowRunRow | undefined
    return row ? parseRow(row) : null
  }

  list(sessionId: string, limit = 20): AxisShadowRunResult[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Axis Shadow run limit must be between 1 and 100')
    return (this.db.prepare(`
      SELECT result_json FROM axis_shadow_runs
      WHERE session_id = ? ORDER BY started_at DESC, run_id DESC LIMIT ?
    `).all(sessionId, limit) as ShadowRunRow[]).map(parseRow)
  }

  delete(runId: string, sessionId: string): void {
    this.db.prepare('DELETE FROM axis_shadow_runs WHERE run_id = ? AND session_id = ?').run(runId, sessionId)
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare('DELETE FROM axis_shadow_runs WHERE session_id = ?').run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}

function parseRow(row: ShadowRunRow): AxisShadowRunResult {
  return AxisShadowRunResultSchema.parse(adaptPersistedShadowRun(JSON.parse(row.result_json) as unknown))
}

function adaptPersistedShadowRun(input: unknown): unknown {
  if (!isRecord(input) || !isRecord(input.complexity)) {
    return input
  }
  const complexity = input.complexity
  const isLegacyClassification = complexity.confidence === undefined
    && complexity.policyAdjustments === undefined
    && complexity.requiredGates === undefined
    && complexity.requiresHumanReview === undefined
    && complexity.schemaVersion === undefined
  if (!isLegacyClassification) return input

  const riskFlags = Array.isArray(complexity.riskFlags)
    ? complexity.riskFlags.filter(isRiskFlag)
    : []
  const requiredGates = requiredAxisGatesForRiskFlags(riskFlags, 0.6)
  const route = complexity.route === 'multi-agent' ? 'multi-agent' : 'single-agent'
  const suggestedWorkers = route === 'multi-agent'
    ? Math.max(2, Math.min(8, typeof complexity.suggestedWorkers === 'number' ? complexity.suggestedWorkers : 2))
    : 1
  const adaptedDag = isRecord(input.dag) && Array.isArray(input.dag.tasks)
    ? {
        ...input.dag,
        tasks: input.dag.tasks.map((task) => isRecord(task)
          ? { ...task, requiredGates, requiresHumanReview: true }
          : task),
      }
    : input.dag
  return {
    ...input,
    complexity: {
      ...complexity,
      confidence: 0.7,
      policyAdjustments: ['legacy-plan-migrated-conservatively'],
      requiredGates,
      requiresHumanReview: true,
      schemaVersion: 1,
      score: Math.max(typeof complexity.score === 'number' ? complexity.score : 1, 4),
      route,
      suggestedWorkers,
    },
    dag: adaptedDag,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRiskFlag(value: unknown): value is ComplexityReport['riskFlags'][number] {
  return value === 'cross-module'
    || value === 'destructive'
    || value === 'security-sensitive'
    || value === 'high-context'
    || value === 'external-runtime'
}
