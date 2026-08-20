import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type {
  PlanDocument,
  PlanDraftInput,
  PlanExecutionMode,
  PlanStatus,
  PlanStep,
  PlanStepStatus,
} from '../../shared/types/domain'

interface PlanRow {
  created_at: string
  execution_mode: PlanExecutionMode | null
  id: string
  session_id: string
  source: string
  status: PlanStatus
  steps_json: string
  title: string
  updated_at: string
  version: number
}

export class PlanRegistry {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        execution_mode TEXT,
        version INTEGER NOT NULL,
        steps_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plans_session_updated ON plans(session_id, updated_at DESC);
    `)
  }

  list(sessionId: string): PlanDocument[] {
    return (this.db.prepare('SELECT * FROM plans WHERE session_id = ? ORDER BY updated_at DESC').all(sessionId) as PlanRow[])
      .map(toPlan)
  }

  listAll(): PlanDocument[] {
    return (this.db.prepare('SELECT * FROM plans ORDER BY updated_at DESC').all() as PlanRow[]).map(toPlan)
  }

  get(id: string): PlanDocument | null {
    const row = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow | undefined
    return row ? toPlan(row) : null
  }

  create(sessionId: string, input: PlanDraftInput): PlanDocument {
    if (!input.title.trim() || !input.source.trim() || input.steps.length === 0) throw new Error('A plan requires a title, source, and at least one step')
    const now = new Date().toISOString()
    const plan: PlanDocument = {
      createdAt: now,
      executionMode: null,
      id: `plan-${randomUUID()}`,
      sessionId,
      source: input.source.trim(),
      status: 'draft',
      steps: input.steps.map((step, index) => ({
        description: step.description.trim(),
        id: `step-${randomUUID()}`,
        order: index,
        selected: true,
        status: 'pending',
        targets: normalizeTargets(step.targets),
        title: step.title.trim() || `Step ${index + 1}`,
      })),
      title: input.title.trim(),
      updatedAt: now,
      version: 1,
    }
    this.insert(plan)
    return plan
  }

  updateDraft(id: string, input: PlanDraftInput): PlanDocument {
    const existing = this.require(id)
    if (existing.status !== 'draft' && existing.status !== 'ready') throw new Error('Only draft or ready plans can be refined')
    const now = new Date().toISOString()
    const steps: PlanStep[] = input.steps.map((step, index) => ({
      description: step.description.trim(),
      id: existing.steps[index]?.id ?? `step-${randomUUID()}`,
      order: index,
      selected: existing.steps[index]?.selected ?? true,
      status: 'pending',
      targets: normalizeTargets(step.targets),
      title: step.title.trim() || `Step ${index + 1}`,
    }))
    const updated = { ...existing, executionMode: null, source: input.source.trim(), status: 'draft' as const, steps, title: input.title.trim(), updatedAt: now, version: existing.version + 1 }
    this.replace(updated)
    return updated
  }

  approve(id: string, executionMode: PlanExecutionMode, selectedStepIds: string[] = []): PlanDocument {
    const existing = this.require(id)
    if (existing.status !== 'draft' && existing.status !== 'ready' && existing.status !== 'paused') throw new Error('Plan cannot be approved in its current state')
    const selected = new Set(selectedStepIds)
    const steps = existing.steps.map((step) => ({
      ...step,
      selected: executionMode !== 'selective' || selected.has(step.id),
      status: executionMode === 'selective' && !selected.has(step.id) ? 'skipped' as const : 'pending' as const,
    }))
    if (!steps.some((step) => step.selected)) throw new Error('Select at least one plan step')
    return this.replace({ ...existing, executionMode, status: 'ready', steps, updatedAt: new Date().toISOString() })
  }

  setStatus(id: string, status: PlanStatus): PlanDocument {
    const existing = this.require(id)
    return this.replace({ ...existing, status, updatedAt: new Date().toISOString() })
  }

  setStepStatus(id: string, stepId: string, status: PlanStepStatus): PlanDocument {
    const existing = this.require(id)
    if (!existing.steps.some((step) => step.id === stepId)) throw new Error(`Plan step not found: ${stepId}`)
    const steps = existing.steps.map((step) => step.id === stepId ? { ...step, status } : step)
    return this.replace({ ...existing, steps, updatedAt: new Date().toISOString() })
  }

  nextPending(id: string): PlanStep | null {
    return this.require(id).steps.find((step) => step.selected && step.status === 'pending') ?? null
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare('DELETE FROM plans WHERE session_id = ?').run(sessionId)
  }

  close(): void {
    this.db.close()
  }

  private require(id: string): PlanDocument {
    const plan = this.get(id)
    if (!plan) throw new Error(`Plan not found: ${id}`)
    return plan
  }

  private insert(plan: PlanDocument): void {
    this.db.prepare(`INSERT INTO plans (id, session_id, title, source, status, execution_mode, version, steps_json, created_at, updated_at)
      VALUES (@id, @sessionId, @title, @source, @status, @executionMode, @version, @stepsJson, @createdAt, @updatedAt)`)
      .run({ ...plan, stepsJson: JSON.stringify(plan.steps) })
  }

  private replace(plan: PlanDocument): PlanDocument {
    this.db.prepare(`UPDATE plans SET title = @title, source = @source, status = @status, execution_mode = @executionMode,
      version = @version, steps_json = @stepsJson, updated_at = @updatedAt WHERE id = @id`)
      .run({ ...plan, stepsJson: JSON.stringify(plan.steps) })
    return plan
  }
}

function toPlan(row: PlanRow): PlanDocument {
  return {
    createdAt: row.created_at,
    executionMode: row.execution_mode,
    id: row.id,
    sessionId: row.session_id,
    source: row.source,
    status: row.status,
    steps: JSON.parse(row.steps_json) as PlanStep[],
    title: row.title,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function normalizeTargets(targets: string[]): string[] {
  return [...new Set(targets.map((target) => target.trim()).filter(Boolean))]
}
