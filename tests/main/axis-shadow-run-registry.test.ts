import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisShadowRunRegistry } from '../../src/main/services/axis-shadow-run-registry'
import type { AxisShadowRunResult } from '../../src/shared/axis-engine-contracts'

describe('Axis shadow run registry', () => {
  it('persists validated plans and scopes them by session', () => {
    const registry = new AxisShadowRunRegistry()
    registry.save(result('run-1', 'session-1'))
    registry.save(result('run-2', 'session-2'))

    expect(registry.get('run-1')?.objective).toBe('Build Axis')
    expect(registry.list('session-1').map((run) => run.trace.runId)).toEqual(['run-1'])
    registry.deleteForSession('session-1')
    expect(registry.get('run-1')).toBeNull()
    registry.close()
  })

  it('opens a task reader Port that enforces run and session ownership', () => {
    const registry = new AxisShadowRunRegistry()
    registry.save(result('run-1', 'session-1'))
    const tasks = registry.openTaskReaderPort()

    expect(tasks.findTask({
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'inspect',
    })?.id).toBe('inspect')
    expect(tasks.findTask({
      runId: 'run-1',
      sessionId: 'session-2',
      taskId: 'inspect',
    })).toBeNull()
    expect(tasks.findTask({
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'missing',
    })).toBeNull()
    registry.close()
  })

  it('opens a frozen replan plan reader Port that enforces run and session ownership', () => {
    const registry = new AxisShadowRunRegistry()
    registry.save(result('run-child-1', 'session-1'))
    const plans = registry.openReplanTaskSchedulingReaderPort()

    expect(Object.isFrozen(plans)).toBe(true)
    expect(plans.find({
      runId: 'run-child-1',
      sessionId: 'session-1',
    })?.trace.runId).toBe('run-child-1')
    expect(plans.find({
      runId: 'run-child-1',
      sessionId: 'session-2',
    })).toBeNull()
    expect(plans.find({
      runId: 'missing',
      sessionId: 'session-1',
    })).toBeNull()
    registry.close()
  })

  it('adapts a persisted pre-classification plan without weakening current Shared contracts', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pivot-axis-plan-migration-'))
    const databasePath = path.join(root, 'pivot.db')
    const legacy = result('run-legacy', 'session-1') as unknown as {
      complexity: Record<string, unknown>
      dag: { tasks: Array<Record<string, unknown>> }
    }
    delete legacy.complexity.confidence
    delete legacy.complexity.policyAdjustments
    delete legacy.complexity.requiredGates
    delete legacy.complexity.requiresHumanReview
    delete legacy.complexity.schemaVersion
    delete legacy.dag.tasks[0]!.requiredGates
    delete legacy.dag.tasks[0]!.requiresHumanReview
    const database = new Database(databasePath)
    database.exec(`CREATE TABLE axis_shadow_runs (run_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, started_at TEXT NOT NULL, result_json TEXT NOT NULL)`)
    database.prepare('INSERT INTO axis_shadow_runs VALUES (?, ?, ?, ?)').run(
      'run-legacy', 'session-1', '2026-07-22T00:00:00.000Z', JSON.stringify(legacy),
    )
    database.close()

    const registry = new AxisShadowRunRegistry(databasePath)
    expect(registry.get('run-legacy')).toMatchObject({
      complexity: {
        confidence: 0.7,
        policyAdjustments: ['legacy-plan-migrated-conservatively'],
        requiredGates: ['compile', 'test', 'correctness'],
        requiresHumanReview: true,
      },
      dag: { tasks: [{ requiredGates: ['compile', 'test', 'correctness'], requiresHumanReview: true }] },
    })
    registry.close()
    rmSync(root, { force: true, recursive: true })
  })

  it('preserves legacy routing while restoring the strongest declared risk Gate', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pivot-axis-plan-risk-migration-'))
    const databasePath = path.join(root, 'pivot.db')
    const legacy = result('run-risk-legacy', 'session-1') as unknown as {
      complexity: Record<string, unknown>
      dag: { tasks: Array<Record<string, unknown>> }
    }
    Object.assign(legacy.complexity, {
      riskFlags: ['security-sensitive'], route: 'multi-agent', suggestedWorkers: 2,
    })
    for (const key of ['confidence', 'policyAdjustments', 'requiredGates', 'requiresHumanReview', 'schemaVersion']) {
      delete legacy.complexity[key]
    }
    const secondTask = { ...legacy.dag.tasks[0]!, id: 'inspect-2' }
    legacy.dag.tasks.push(secondTask)
    for (const task of legacy.dag.tasks) {
      delete task.requiredGates
      delete task.requiresHumanReview
    }
    const database = new Database(databasePath)
    database.exec(`CREATE TABLE axis_shadow_runs (run_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, started_at TEXT NOT NULL, result_json TEXT NOT NULL)`)
    database.prepare('INSERT INTO axis_shadow_runs VALUES (?, ?, ?, ?)').run(
      'run-risk-legacy', 'session-1', '2026-07-22T00:00:00.000Z', JSON.stringify(legacy),
    )
    database.close()

    const registry = new AxisShadowRunRegistry(databasePath)
    expect(registry.get('run-risk-legacy')).toMatchObject({
      complexity: {
        requiredGates: ['compile', 'test', 'correctness', 'security'],
        route: 'multi-agent',
        suggestedWorkers: 2,
      },
      dag: { tasks: [
        { requiredGates: ['compile', 'test', 'correctness', 'security'] },
        { requiredGates: ['compile', 'test', 'correctness', 'security'] },
      ] },
    })
    registry.close()
    rmSync(root, { force: true, recursive: true })
  })

  it('adapts a legacy budget-stopped result that has no DAG', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pivot-axis-stopped-migration-'))
    const databasePath = path.join(root, 'pivot.db')
    const legacy = result('run-stopped-legacy', 'session-1') as unknown as Record<string, unknown> & {
      complexity: Record<string, unknown>
    }
    Object.assign(legacy, { dag: null, schedule: null, status: 'stopped', stopReason: 'token-limit' })
    for (const key of ['confidence', 'policyAdjustments', 'requiredGates', 'requiresHumanReview', 'schemaVersion']) {
      delete legacy.complexity[key]
    }
    const database = new Database(databasePath)
    database.exec(`CREATE TABLE axis_shadow_runs (run_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, started_at TEXT NOT NULL, result_json TEXT NOT NULL)`)
    database.prepare('INSERT INTO axis_shadow_runs VALUES (?, ?, ?, ?)').run(
      'run-stopped-legacy', 'session-1', '2026-07-22T00:00:00.000Z', JSON.stringify(legacy),
    )
    database.close()

    const registry = new AxisShadowRunRegistry(databasePath)
    expect(registry.get('run-stopped-legacy')).toMatchObject({
      complexity: { policyAdjustments: ['legacy-plan-migrated-conservatively'] },
      dag: null,
      status: 'stopped',
      stopReason: 'token-limit',
    })
    registry.close()
    rmSync(root, { force: true, recursive: true })
  })
})

function result(runId: string, sessionId: string): AxisShadowRunResult {
  const startedAt = '2026-07-22T00:00:00.000Z'
  return {
    complexity: { confidence: 1, policyAdjustments: [], reasons: ['Simple'], requiredGates: ['compile', 'test'], requiresHumanReview: false, riskFlags: [], route: 'single-agent', schemaVersion: 1, score: 1, suggestedWorkers: 1 },
    dag: {
      createdAt: startedAt, dagId: `dag-${runId}`, objective: 'Build Axis', schemaVersion: 1,
      tasks: [{ assignedFiles: [], dependencies: [], estimatedComplexity: 1, id: 'inspect', objective: 'Inspect', requiredGates: ['compile', 'test'], requiresHumanReview: false, requiredTools: ['read'], spawnDepth: 1, title: 'Inspect' }],
    },
    mode: 'shadow',
    objective: 'Build Axis',
    schedule: { batches: [['inspect']], orderedTaskIds: ['inspect'], warnings: [] },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{ detail: 'done', sequence: 1, taskId: null, timestamp: startedAt, type: 'run-completed' }],
      runId, sessionId, startedAt, traceId: `trace-${runId}`,
    },
    usage: { costUsd: 0.01, durationMs: 100, gateCyclesForFile: 0, pivots: 0, retriesForTask: 0, tokens: 100 },
  }
}
