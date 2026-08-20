import { describe, expect, it, vi } from 'vitest'
import { AxisComplexityEvaluator } from '../../src/main/services/axis-complexity-evaluator'
import type { AxisPlanningModel } from '../../src/main/services/axis-planning-model'
import { AxisShadowRunCoordinator } from '../../src/main/services/axis-shadow-run-coordinator'
import { AxisTaskDecomposer } from '../../src/main/services/axis-task-decomposer'
import { AxisTraceRegistry } from '../../src/main/services/axis-trace-registry'
import type { AxisShadowRunRequest, TaskDagProposal } from '../../src/shared/axis-engine-contracts'

describe('Axis shadow run coordinator', () => {
  it('plans and persists an auditable DAG without exposing an execution dependency', async () => {
    const model = planningModel()
    const traces = new AxisTraceRegistry()
    const coordinator = coordinatorWith(model, traces)

    const result = await coordinator.plan(request())

    expect(result).toMatchObject({ mode: 'shadow', status: 'planned', stopReason: null })
    expect(result.schedule?.batches).toEqual([['inspect'], ['implement']])
    expect(result.trace.events.map((item) => item.type)).toEqual([
      'run-started', 'complexity-evaluated', 'dag-created', 'task-scheduled', 'task-scheduled', 'run-completed',
    ])
    expect(traces.get('run-test')).toEqual(result.trace)
    expect(model.assessComplexity).toHaveBeenCalledOnce()
    expect(model.decomposeTask).toHaveBeenCalledOnce()
    traces.close()
  })

  it('hard-stops after complexity usage exceeds budget and never asks for a DAG', async () => {
    const model = planningModel({ complexityTokens: 101 })
    const traces = new AxisTraceRegistry()
    const result = await coordinatorWith(model, traces).plan(request({ maxTokens: 100 }))

    expect(result).toMatchObject({ dag: null, schedule: null, status: 'stopped', stopReason: 'token-limit' })
    expect(model.decomposeTask).not.toHaveBeenCalled()
    expect(result.trace.events.map((item) => item.type)).toEqual([
      'run-started', 'complexity-evaluated', 'budget-stopped', 'run-completed',
    ])
    traces.close()
  })

  it('persists a terminal failure trace when model decomposition violates the contract', async () => {
    const model = planningModel({ dagObjective: 'Drifted objective' })
    const traces = new AxisTraceRegistry()
    const coordinator = coordinatorWith(model, traces)

    await expect(coordinator.plan(request())).rejects.toThrow(/objective/i)
    expect(traces.get('run-test')?.events.at(-1)?.type).toBe('run-failed')
    traces.close()
  })
})

function coordinatorWith(model: AxisPlanningModel, traces: AxisTraceRegistry): AxisShadowRunCoordinator {
  return new AxisShadowRunCoordinator({
    clock: () => new Date('2026-07-22T00:00:00.000Z'),
    complexityEvaluator: new AxisComplexityEvaluator(model),
    decomposer: new AxisTaskDecomposer(model),
    idFactory: (kind) => `${kind}-test`,
    traces,
  })
}

function planningModel(options: { complexityTokens?: number; dagObjective?: string } = {}): AxisPlanningModel {
  return {
    assessComplexity: vi.fn(async () => ({
      output: { confidence: 0.9, reasons: ['Two ordered tasks'], riskFlags: ['cross-module'], route: 'multi-agent', score: 3, suggestedWorkers: 2 },
      usage: { costUsd: 0.001, tokens: options.complexityTokens ?? 20 },
    })),
    decomposeTask: vi.fn(async () => ({ output: dag(options.dagObjective), usage: { costUsd: 0.002, tokens: 40 } })),
  }
}

function dag(objective = 'Build shadow planning'): TaskDagProposal {
  return {
    createdAt: '2026-07-22T00:00:00.000Z', dagId: 'dag-test', objective, schemaVersion: 1,
    tasks: [
      { assignedFiles: [], dependencies: [], estimatedComplexity: 1, id: 'inspect', objective: 'Inspect', requiredTools: ['read'], spawnDepth: 1, title: 'Inspect' },
      { assignedFiles: ['src/main/axis.ts'], dependencies: ['inspect'], estimatedComplexity: 3, id: 'implement', objective: 'Implement', requiredTools: ['write'], spawnDepth: 1, title: 'Implement' },
    ],
  }
}

function request(budgetPatch: Partial<AxisShadowRunRequest['budget']> = {}): AxisShadowRunRequest {
  return {
    budget: {
      maxCostUsd: 1, maxDurationMs: 60_000, maxGateCyclesPerFile: 3, maxPivots: 2,
      maxRetriesPerTask: 1, maxTokens: 1_000, maxWorkers: 2, ...budgetPatch,
    },
    context: { availableFiles: ['src/main/axis.ts'], constraints: ['Shadow mode only'] },
    objective: 'Build shadow planning',
    sessionId: 'session-1',
  }
}
