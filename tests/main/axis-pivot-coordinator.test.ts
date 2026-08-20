import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import type { AxisPivotModel } from '../../src/main/services/axis-pivot-model'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import type { AxisRunState } from '../../src/shared/axis-engine-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

let root = ''
let databasePath = ''

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'pivot-axis-dynamic-pivot-'))
  databasePath = path.join(root, 'pivot.db')
})

afterEach(async () => {
  await rm(root, { force: true, recursive: true })
})

describe('Axis Dynamic Pivot coordinator', () => {
  it('binds a minor-issue decision to the failed revision, remaining budget, and allowed actions', async () => {
    const harness = createHarness({ maxPivots: 2 })
    const source = createFailedRun(harness.states, harness.budget)
    const model = pivotModel({ action: 'self-repair', reason: 'Repair the narrow omission', taskId: 'inspect' })
    const coordinator = createCoordinator(harness, model, 'pivot-1')

    const record = await coordinator.decide(request(source, 'minor'))

    expect(model.decidePivot).toHaveBeenCalledWith(expect.objectContaining({
      allowedActions: ['self-repair', 'retry', 'stop'],
      objective: source.objective,
      remainingBudget: expect.objectContaining({ pivots: 2 }),
      sourceRevision: source.revision,
    }))
    expect(record).toMatchObject({
      decision: { action: 'self-repair', taskId: 'inspect' },
      forced: false,
      sequence: 1,
      sourceRevision: source.revision,
      status: 'decided',
    })
    expect(harness.states.get(source.runId)).toMatchObject({
      revision: source.revision + 1,
      usage: expect.objectContaining({ pivots: 1, tokens: 12 }),
    })
    expect(harness.states.get(source.runId)?.events.at(-1)).toMatchObject({
      pivotDecisionId: 'pivot-1',
      type: 'pivot-decided',
    })
    closeHarness(harness)
  })

  it('rejects a Provider action that is forbidden for a security trigger', async () => {
    const harness = createHarness({ maxPivots: 2 })
    const source = createFailedRun(harness.states, harness.budget)
    const coordinator = createCoordinator(
      harness,
      pivotModel({ action: 'self-repair', reason: 'Unsafe self repair', taskId: 'inspect' }),
      'pivot-security',
    )

    await expect(coordinator.decide(request(source, 'security'))).rejects.toThrow(/allowed action/i)

    expect(harness.decisions.get('pivot-security')).toMatchObject({
      decision: null,
      error: expect.stringMatching(/allowed action/i),
      status: 'failed',
    })
    expect(harness.states.get(source.runId)).toMatchObject({ revision: source.revision, usage: expect.objectContaining({ pivots: 0 }) })
    const retryModel = pivotModel({ action: 'dedicated-fixer', reason: 'Use the security fixer', taskId: 'inspect' })
    await expect(createCoordinator(harness, retryModel, 'pivot-security-retry').decide(request(source, 'security')))
      .rejects.toThrow(/already recorded/i)
    expect(retryModel.decidePivot).not.toHaveBeenCalled()
    closeHarness(harness)
  })

  it('forces stop without invoking the Provider when maxPivots is exhausted', async () => {
    const harness = createHarness({ maxPivots: 0 })
    const source = createFailedRun(harness.states, harness.budget)
    const model = pivotModel({ action: 'retry', reason: 'Retry', taskId: 'inspect' })
    const record = await createCoordinator(harness, model, 'pivot-limit').decide(request(source, 'direction'))

    expect(model.decidePivot).not.toHaveBeenCalled()
    expect(record).toMatchObject({
      decision: { action: 'stop', taskId: 'inspect' },
      forced: true,
      stopReason: 'pivot-limit',
      status: 'decided',
    })
    expect(harness.states.get(source.runId)).toMatchObject({
      revision: source.revision + 1,
      usage: expect.objectContaining({ pivots: 0, tokens: 0 }),
    })
    closeHarness(harness)
  })

  it('allows a paused security run to route only through a dedicated fixer, escalation, or stop', async () => {
    const harness = createHarness({ maxPivots: 2 })
    const source = createPausedRun(harness.states, harness.budget)
    const model = pivotModel({ action: 'dedicated-fixer', reason: 'Use the isolated security fixer', taskId: 'inspect' })

    const record = await createCoordinator(harness, model, 'pivot-security-fixer').decide(request(source, 'security'))

    expect(model.decidePivot).toHaveBeenCalledWith(expect.objectContaining({
      allowedActions: ['dedicated-fixer', 'escalate', 'stop'],
      sourceStatus: 'paused',
    }))
    expect(record).toMatchObject({ decision: { action: 'dedicated-fixer' }, status: 'decided' })
    expect(harness.states.get(source.runId)).toMatchObject({
      revision: source.revision + 1,
      status: 'paused',
      usage: expect.objectContaining({ pivots: 1 }),
    })
    closeHarness(harness)
  })

  it('converts an otherwise valid proposal to a forced stop when model usage exceeds budget', async () => {
    const harness = createHarness({ maxPivots: 2, maxTokens: 10 })
    const source = createFailedRun(harness.states, harness.budget)
    const model = pivotModel(
      { action: 'retry', reason: 'Retry with corrected direction', taskId: 'inspect' },
      { costUsd: 0.001, tokens: 11 },
    )

    const record = await createCoordinator(harness, model, 'pivot-token-limit').decide(request(source, 'direction'))

    expect(record).toMatchObject({
      decision: { action: 'stop' },
      forced: true,
      proposal: { action: 'retry' },
      stopReason: 'token-limit',
      status: 'decided',
    })
    expect(harness.states.get(source.runId)).toMatchObject({
      usage: expect.objectContaining({ pivots: 0, tokens: 11 }),
    })
    closeHarness(harness)
  })

  it('marks the Provider response stale when the run revision changes while deciding', async () => {
    const harness = createHarness({ maxPivots: 2 })
    const source = createFailedRun(harness.states, harness.budget)
    const deferred = deferredGeneration()
    const coordinator = createCoordinator(harness, { decidePivot: () => deferred.promise }, 'pivot-stale')

    const pending = coordinator.decide(request(source, 'direction'))
    await vi.waitFor(() => expect(harness.decisions.get('pivot-stale')?.status).toBe('deciding'))
    harness.states.restart({
      expectedRevision: source.revision,
      runId: source.runId,
      sessionId: source.sessionId,
    })
    deferred.resolve({
      output: { action: 'retry', reason: 'Late retry', taskId: 'inspect' },
      usage: { costUsd: 0, tokens: 1 },
    })

    await expect(pending).rejects.toThrow(/stale/i)
    expect(harness.decisions.get('pivot-stale')).toMatchObject({
      proposal: { action: 'retry' },
      status: 'stale',
    })
    expect(harness.states.get(source.runId)).toMatchObject({ revision: source.revision + 1, usage: expect.objectContaining({ pivots: 0 }) })
    closeHarness(harness)
  })

  it('recovers a crash between durable decision preparation and run-state commit', async () => {
    const harness = createHarness({ maxPivots: 2 })
    const source = createFailedRun(harness.states, harness.budget)
    const crashingStates = {
      get: (runId: string) => harness.states.get(runId),
      recordPivot: () => {
        throw new Error('simulated process crash')
      },
    }
    const first = new AxisPivotCoordinator({
      decisions: harness.decisions,
      idFactory: () => 'pivot-recover',
      model: pivotModel({ action: 'retry', reason: 'Retry after failure', taskId: 'inspect' }),
      states: crashingStates,
    })

    await expect(first.decide(request(source, 'direction'))).rejects.toThrow(/simulated process crash/i)
    expect(harness.decisions.get('pivot-recover')?.status).toBe('committing')

    harness.decisions.close()
    const reopened = new AxisPivotDecisionRegistry(databasePath)
    const recovered = new AxisPivotCoordinator({
      decisions: reopened,
      idFactory: () => 'unused',
      model: pivotModel({ action: 'stop', reason: 'unused', taskId: 'inspect' }),
      states: harness.states,
    }).recoverInterrupted()

    expect(recovered).toEqual([expect.objectContaining({ decisionId: 'pivot-recover', status: 'decided' })])
    expect(harness.states.get(source.runId)).toMatchObject({
      revision: source.revision + 1,
      usage: expect.objectContaining({ pivots: 1 }),
    })
    reopened.close()
    harness.states.close()
  })

  it('persists ordered decision evidence across database reopen', async () => {
    const harness = createHarness({ maxPivots: 2 })
    const source = createFailedRun(harness.states, harness.budget)
    await createCoordinator(
      harness,
      pivotModel({ action: 'replan', reason: 'The plan structure is wrong', taskId: 'inspect' }),
      'pivot-persisted',
    ).decide(request(source, 'design'))
    harness.decisions.close()

    const reopened = new AxisPivotDecisionRegistry(databasePath)
    expect(reopened.listForRun(source.runId)).toEqual([
      expect.objectContaining({ decisionId: 'pivot-persisted', sequence: 1, status: 'decided' }),
    ])
    reopened.close()
    harness.states.close()
  })
})

function createHarness(budgetPatch: Partial<ReturnType<typeof axisBudget>> = {}) {
  return {
    budget: { ...axisBudget(), ...budgetPatch },
    decisions: new AxisPivotDecisionRegistry(databasePath, { clock: sequenceClock() }),
    states: new AxisRunStateRegistry(databasePath, { clock: sequenceClock() }),
  }
}

function closeHarness(harness: ReturnType<typeof createHarness>): void {
  harness.decisions.close()
  harness.states.close()
}

function createFailedRun(
  states: AxisRunStateRegistry,
  budget: ReturnType<typeof axisBudget>,
): AxisRunState {
  const plan = axisShadowResult('run-1', 'session-1')
  let state = states.create(plan, budget)
  state = states.startDryRun({
    approvedTaskIds: ['inspect'],
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  })
  state = states.startTask({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    taskId: 'inspect',
  })
  return states.completeTask({
    expectedRevision: state.revision,
    result: {
      artifacts: [],
      findings: [],
      status: 'failed',
      summary: 'Quality gate failed',
      taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 0, tokens: 0 },
    },
    runId: state.runId,
    sessionId: state.sessionId,
  })
}

function createPausedRun(
  states: AxisRunStateRegistry,
  budget: ReturnType<typeof axisBudget>,
): AxisRunState {
  const plan = axisShadowResult('run-1', 'session-1')
  let state = states.create(plan, budget)
  state = states.startDryRun({
    approvedTaskIds: ['inspect'],
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  })
  return states.pause({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    stopReason: 'time-limit',
  })
}

function createCoordinator(
  harness: ReturnType<typeof createHarness>,
  model: AxisPivotModel,
  decisionId: string,
): AxisPivotCoordinator {
  return new AxisPivotCoordinator({
    decisions: harness.decisions,
    idFactory: () => decisionId,
    model,
    states: harness.states,
  })
}

function request(state: AxisRunState, category: 'minor' | 'direction' | 'design' | 'security' | 'excessive') {
  return {
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    trigger: {
      category,
      evidenceIds: ['gate-evidence-1'],
      summary: 'Reviewer rejected the task result',
      taskId: 'inspect',
    },
  }
}

function pivotModel(
  output: { action: 'self-repair' | 'retry' | 'replan' | 'dedicated-fixer' | 'discard' | 'escalate' | 'stop'; reason: string; taskId: string | null },
  usage = { costUsd: 0.001, tokens: 12 },
): AxisPivotModel {
  return { decidePivot: vi.fn(async () => ({ output, usage })) }
}

function deferredGeneration() {
  let resolve!: (value: Awaited<ReturnType<AxisPivotModel['decidePivot']>>) => void
  const promise = new Promise<Awaited<ReturnType<AxisPivotModel['decidePivot']>>>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function sequenceClock(): () => Date {
  let second = 0
  return () => new Date(`2026-07-26T01:00:${String(second++).padStart(2, '0')}.000Z`)
}
