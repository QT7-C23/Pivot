import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxisPlanLineageRegistry } from '../../src/main/services/axis-plan-lineage-registry'
import { AxisReplanCoordinator } from '../../src/main/services/axis-replan-coordinator'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisShadowRunRegistry } from '../../src/main/services/axis-shadow-run-registry'
import type { AxisShadowRunRequest, AxisShadowRunResult } from '../../src/shared/axis-engine-contracts'
import { axisBudget, axisShadowResult, emptyUsage } from '../fixtures/axis-shadow-run'

let root = ''
let databasePath = ''

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'pivot-axis-replan-'))
  databasePath = path.join(root, 'pivot.db')
})

afterEach(async () => {
  await rm(root, { force: true, recursive: true })
})

describe('Axis Provider replanning', () => {
  it('creates a durable child plan from a failed revision without changing objective or file scope', async () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    const child = planResult('run-child', ['src/main/axis.ts'])
    const planner = { plan: vi.fn(async () => child) }
    const coordinator = new AxisReplanCoordinator({ ...harness, idFactory: () => 'replan-1', planner })

    const result = await coordinator.replan(replanRequest(parent.revision))

    expect(planner.plan).toHaveBeenCalledWith(expect.objectContaining({
      context: { availableFiles: ['src/main/axis.ts'], constraints: ['Planning only'] },
      objective: parent.objective,
      sessionId: parent.sessionId,
    }))
    expect(result.plan).toEqual(child)
    expect(result.lineage).toMatchObject({
      childRunId: 'run-child',
      generation: 2,
      parentRunId: 'run-parent',
      rootRunId: 'run-parent',
      sourceRevision: parent.revision,
      status: 'completed',
    })
    expect(harness.plans.get('run-child')).toEqual(child)
    expect(harness.states.get('run-child')).toMatchObject({ objective: parent.objective, status: 'planned' })
    closeHarness(harness)
  })

  it('rejects a Provider response when the parent revision changes while planning', async () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    const deferred = deferredPlan()
    const coordinator = new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-stale',
      planner: { plan: () => deferred.promise },
    })

    const pending = coordinator.replan(replanRequest(parent.revision))
    await vi.waitFor(() => expect(harness.lineages.get('replan-stale')?.status).toBe('planning'))
    harness.states.restart({
      expectedRevision: parent.revision,
      runId: parent.runId,
      sessionId: parent.sessionId,
    })
    deferred.resolve(planResult('run-stale-child', ['src/main/axis.ts']))

    await expect(pending).rejects.toThrow(/stale/i)
    expect(harness.lineages.get('replan-stale')).toMatchObject({
      childRunId: 'run-stale-child',
      status: 'stale',
    })
    expect(harness.plans.get('run-stale-child')).toBeNull()
    expect(harness.states.get('run-stale-child')).toBeNull()
    closeHarness(harness)
  })

  it('rejects Provider plans that expand beyond the frozen project file scope', async () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    const coordinator = new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-outside',
      planner: { plan: async () => planResult('run-outside', ['src/secret.ts']) },
    })

    await expect(coordinator.replan(replanRequest(parent.revision))).rejects.toThrow(/file scope/i)
    expect(harness.lineages.get('replan-outside')).toMatchObject({ childRunId: null, status: 'failed' })
    expect(harness.plans.get('run-outside')).toBeNull()
    closeHarness(harness)
  })

  it('accepts stopped planning runs as revision-bound replan sources', async () => {
    const harness = createHarness()
    const stopped = stoppedPlanResult('run-parent')
    harness.plans.save(stopped)
    const parent = harness.states.create(stopped, axisBudget())
    const coordinator = new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-stopped',
      planner: { plan: async () => planResult('run-from-stopped', ['src/main/axis.ts']) },
    })

    const result = await coordinator.replan(replanRequest(parent.revision))

    expect(result.lineage).toMatchObject({ parentRunId: 'run-parent', sourceRevision: 1, status: 'completed' })
    expect(harness.states.get('run-from-stopped')).toMatchObject({ status: 'planned' })
    closeHarness(harness)
  })

  it('accepts a paused Dynamic Pivot run as a revision-bound replan source', async () => {
    const harness = createHarness()
    const parentPlan = axisShadowResult('run-parent', 'session-1')
    harness.plans.save(parentPlan)
    let parent = harness.states.create(parentPlan, axisBudget())
    parent = harness.states.startDryRun({
      approvedTaskIds: ['inspect'],
      expectedRevision: parent.revision,
      runId: parent.runId,
      sessionId: parent.sessionId,
    })
    parent = harness.states.pause({
      expectedRevision: parent.revision,
      runId: parent.runId,
      sessionId: parent.sessionId,
      stopReason: 'time-limit',
    })
    const coordinator = new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-paused',
      planner: { plan: async () => planResult('run-from-paused', ['src/main/axis.ts']) },
    })

    const result = await coordinator.replan(replanRequest(parent.revision))

    expect(result.lineage).toMatchObject({
      parentRunId: 'run-parent',
      sourceRevision: parent.revision,
      status: 'completed',
    })
    expect(harness.states.get('run-from-paused')).toMatchObject({ status: 'planned' })
    closeHarness(harness)
  })

  it('returns the existing completed child for the same parent revision without another Provider call', async () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    const firstPlanner = { plan: vi.fn(async () => planResult('run-child', ['src/main/axis.ts'])) }
    const first = await new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-first',
      planner: firstPlanner,
    }).replan(replanRequest(parent.revision))
    const repeatedPlanner = { plan: vi.fn(async () => planResult('run-duplicate', ['src/main/axis.ts'])) }

    const repeated = await new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-duplicate',
      planner: repeatedPlanner,
    }).replan(replanRequest(parent.revision))

    expect(repeated).toEqual(first)
    expect(repeatedPlanner.plan).not.toHaveBeenCalled()
    expect(harness.plans.get('run-duplicate')).toBeNull()
    closeHarness(harness)
  })

  it('does not replay a failed replan action for the same parent revision', async () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    await expect(new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-failed-once',
      planner: { plan: async () => planResult('run-outside-once', ['src/outside.ts']) },
    }).replan(replanRequest(parent.revision))).rejects.toThrow(/file scope/i)
    const repeatedPlanner = {
      plan: vi.fn(async () => planResult('run-must-not-exist', ['src/main/axis.ts'])),
    }

    await expect(new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-failed-twice',
      planner: repeatedPlanner,
    }).replan(replanRequest(parent.revision))).rejects.toThrow(/already attempted/i)

    expect(repeatedPlanner.plan).not.toHaveBeenCalled()
    expect(harness.lineages.get('replan-failed-twice')).toBeNull()
    closeHarness(harness)
  })

  it('extends an existing lineage without losing its root plan or generation order', async () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    const first = await new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-generation-2',
      planner: { plan: async () => planResult('run-child', ['src/main/axis.ts']) },
    }).replan(replanRequest(parent.revision))
    const failedChild = failPlannedRun(harness.states, first.plan.trace.runId, first.plan.trace.sessionId)

    const second = await new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'replan-generation-3',
      planner: { plan: async () => planResult('run-grandchild', ['src/main/axis.ts']) },
    }).replan(replanRequest(failedChild.revision, failedChild.runId))

    expect(second.lineage).toMatchObject({
      generation: 3,
      parentRunId: 'run-child',
      rootRunId: 'run-parent',
      status: 'completed',
    })
    closeHarness(harness)
  })

  it('recovers a crash after the child plan was saved but before its run state was materialized', () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    const coordinator = new AxisReplanCoordinator({
      ...harness,
      idFactory: () => 'unused',
      planner: { plan: async () => planResult('unused', []) },
    })
    const lineage = harness.lineages.begin({
      attemptId: 'replan-recover',
      budget: axisBudget(),
      fileScope: ['src/main/axis.ts'],
      generation: 2,
      objective: parent.objective,
      parentRunId: parent.runId,
      rootRunId: parent.runId,
      sessionId: parent.sessionId,
      sourceRevision: parent.revision,
    })
    const materializing = harness.lineages.markMaterializing(lineage.attemptId, 'run-recovered-child')
    expect(materializing.status).toBe('materializing')
    harness.plans.save(planResult('run-recovered-child', ['src/main/axis.ts']))

    expect(coordinator.recoverInterrupted()).toEqual([
      expect.objectContaining({ attemptId: 'replan-recover', status: 'completed' }),
    ])
    expect(harness.states.get('run-recovered-child')).toMatchObject({ status: 'planned' })
    closeHarness(harness)
  })

  it('marks an in-flight Provider request as interrupted after restart and preserves the record', () => {
    const harness = createHarness()
    const parent = createFailedParent(harness.plans, harness.states)
    harness.lineages.begin({
      attemptId: 'replan-interrupted',
      budget: axisBudget(),
      fileScope: ['src/main/axis.ts'],
      generation: 2,
      objective: parent.objective,
      parentRunId: parent.runId,
      rootRunId: parent.runId,
      sessionId: parent.sessionId,
      sourceRevision: parent.revision,
    })
    harness.lineages.close()
    const reopenedLineages = new AxisPlanLineageRegistry(databasePath)

    const recovered = new AxisReplanCoordinator({
      idFactory: () => 'unused',
      lineages: reopenedLineages,
      planner: { plan: async () => planResult('unused', []) },
      plans: harness.plans,
      states: harness.states,
    }).recoverInterrupted()

    expect(recovered).toEqual([
      expect.objectContaining({ attemptId: 'replan-interrupted', error: expect.stringMatching(/interrupted/i), status: 'interrupted' }),
    ])
    expect(reopenedLineages.get('replan-interrupted')).toMatchObject({ status: 'interrupted' })
    reopenedLineages.close()
    harness.plans.close()
    harness.states.close()
  })
})

function createHarness() {
  return {
    lineages: new AxisPlanLineageRegistry(databasePath, { clock: sequenceClock() }),
    plans: new AxisShadowRunRegistry(databasePath),
    states: new AxisRunStateRegistry(databasePath, { clock: sequenceClock() }),
  }
}

function closeHarness(harness: ReturnType<typeof createHarness>): void {
  harness.lineages.close()
  harness.plans.close()
  harness.states.close()
}

function createFailedParent(plans: AxisShadowRunRegistry, states: AxisRunStateRegistry) {
  const parentPlan = axisShadowResult('run-parent', 'session-1')
  plans.save(parentPlan)
  states.create(parentPlan, axisBudget())
  return failPlannedRun(states, parentPlan.trace.runId, parentPlan.trace.sessionId)
}

function failPlannedRun(states: AxisRunStateRegistry, runId: string, sessionId: string) {
  let state = states.get(runId)!
  state = states.startDryRun({
    approvedTaskIds: ['inspect'],
    expectedRevision: state.revision,
    runId,
    sessionId,
  })
  state = states.startTask({
    expectedRevision: state.revision,
    runId,
    sessionId,
    taskId: 'inspect',
  })
  return states.completeTask({
    expectedRevision: state.revision,
    result: {
      artifacts: [],
      findings: [],
      status: 'failed',
      summary: 'Provider replanning fixture failure',
      taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 1, tokens: 0 },
    },
    runId,
    sessionId,
  })
}

function replanRequest(expectedRevision: number, parentRunId = 'run-parent') {
  return {
    budget: axisBudget(),
    context: { availableFiles: ['src/main/axis.ts'], constraints: ['Planning only'] },
    expectedRevision,
    parentRunId,
    sessionId: 'session-1',
  }
}

function planResult(runId: string, assignedFiles: string[]): AxisShadowRunResult {
  const startedAt = '2026-07-26T00:00:00.000Z'
  return {
    complexity: { confidence: 1, policyAdjustments: [], reasons: ['Fresh Provider plan'], requiredGates: ['compile', 'test'], requiresHumanReview: false, riskFlags: [], route: 'single-agent', schemaVersion: 1, score: 1, suggestedWorkers: 1 },
    dag: {
      createdAt: startedAt,
      dagId: `dag-${runId}`,
      objective: 'Build Axis state',
      schemaVersion: 1,
      tasks: [{
        assignedFiles,
        dependencies: [],
        estimatedComplexity: 1,
        id: 'inspect',
        objective: 'Inspect',
        requiredTools: ['read'],
        requiredGates: ['compile', 'test'],
        requiresHumanReview: false,
        spawnDepth: 1,
        title: 'Inspect',
      }],
    },
    mode: 'shadow',
    objective: 'Build Axis state',
    schedule: { batches: [['inspect']], orderedTaskIds: ['inspect'], warnings: [] },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{ detail: 'done', sequence: 1, taskId: null, timestamp: startedAt, type: 'run-completed' }],
      runId,
      sessionId: 'session-1',
      startedAt,
      traceId: `trace-${runId}`,
    },
    usage: emptyUsage(),
  }
}

function stoppedPlanResult(runId: string): AxisShadowRunResult {
  const startedAt = '2026-07-26T00:00:00.000Z'
  return {
    complexity: null,
    dag: null,
    mode: 'shadow',
    objective: 'Build Axis state',
    schedule: null,
    status: 'stopped',
    stopReason: 'token-limit',
    trace: {
      events: [{ detail: 'stopped', sequence: 1, taskId: null, timestamp: startedAt, type: 'budget-stopped' }],
      runId,
      sessionId: 'session-1',
      startedAt,
      traceId: `trace-${runId}`,
    },
    usage: emptyUsage(),
  }
}

function deferredPlan(): { promise: Promise<AxisShadowRunResult>; resolve: (value: AxisShadowRunResult) => void } {
  let resolve!: (value: AxisShadowRunResult) => void
  const promise = new Promise<AxisShadowRunResult>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function sequenceClock(): () => Date {
  let second = 0
  return () => new Date(`2026-07-26T00:00:${String(second++).padStart(2, '0')}.000Z`)
}
