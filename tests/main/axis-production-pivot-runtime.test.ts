import { access, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import {
  createAxisProductionPivotRuntime,
  resolveAxisDynamicPivotFeature,
} from '../../src/main/services/axis-production-pivot-runtime'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisShadowRunRegistry } from '../../src/main/services/axis-shadow-run-registry'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis production Dynamic Pivot runtime', () => {
  it('is default-off, rejects malformed configuration, and constructs no resources', async () => {
    expect(resolveAxisDynamicPivotFeature({}).isEnabled()).toBe(false)
    expect(resolveAxisDynamicPivotFeature({
      PIVOT_AXIS_DYNAMIC_PIVOT: '0',
    }).isEnabled()).toBe(false)
    expect(() => resolveAxisDynamicPivotFeature({
      PIVOT_AXIS_DYNAMIC_PIVOT: 'yes',
    })).toThrow(/0 or 1/i)

    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-runtime-off-'))
    const databasePath = path.join(directory, 'pivot.db')
    const modelFactory = vi.fn()
    const plannerFactory = vi.fn()
    try {
      const runtime = createAxisProductionPivotRuntime({
        databasePath,
        feature: resolveAxisDynamicPivotFeature({}),
        files: { list: async () => [] },
        modelFactory,
        plannerFactory,
        plans: unusedPlans(),
        projects: { findBySession: () => null },
        states: unusedStates(),
      })

      expect(runtime).toBeNull()
      expect(modelFactory).not.toHaveBeenCalled()
      expect(plannerFactory).not.toHaveBeenCalled()
      await expect(access(databasePath)).rejects.toThrow()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('decides, commits, dispatches, and durably reopens a terminal stop', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-runtime-stop-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const plans = new AxisShadowRunRegistry(databasePath)
      const states = new AxisRunStateRegistry(databasePath, {
        clock: sequenceClock(),
      })
      const state = failedRun(plans, states, 'run-stop', 'session-1')
      const decidePivot = vi.fn(async () => ({
        output: {
          action: 'stop' as const,
          reason: 'Stop after the failed direction',
          taskId: 'inspect',
        },
        usage: { costUsd: 0.01, tokens: 10 },
      }))
      const runtime = createRuntime({
        databasePath,
        decidePivot,
        plans,
        states,
      })

      const result = await runtime.decideAndDispatch({
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        trigger: {
          category: 'direction',
          evidenceIds: ['failure-1'],
          summary: 'Direction failed',
          taskId: 'inspect',
        },
      })

      expect(result).toMatchObject({
        route: 'terminal',
        result: { action: 'stop', outcome: 'stopped' },
      })
      expect(states.get(state.runId)?.status).toBe('stopped')
      expect(runtime.findDispatch(result.decisionId)).toEqual(result)
      runtime.close()
      states.close()
      plans.close()

      const reopenedPlans = new AxisShadowRunRegistry(databasePath)
      const reopenedStates = new AxisRunStateRegistry(databasePath)
      const reopenedModel = vi.fn()
      const reopened = createRuntime({
        databasePath,
        decidePivot: reopenedModel,
        plans: reopenedPlans,
        states: reopenedStates,
      })
      await reopened.ready

      expect(reopened.findDispatch(result.decisionId)).toEqual(result)
      expect(reopenedModel).not.toHaveBeenCalled()
      reopened.close()
      reopened.close()
      reopenedStates.close()
      reopenedPlans.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('recovers and dispatches a committed decision that has no dispatch receipt', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-runtime-recover-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const plans = new AxisShadowRunRegistry(databasePath)
      const states = new AxisRunStateRegistry(databasePath, {
        clock: sequenceClock(),
      })
      const state = failedRun(plans, states, 'run-recover', 'session-1')
      const decisions = new AxisPivotDecisionRegistry(databasePath, {
        clock: sequenceClock(),
      })
      await new AxisPivotCoordinator({
        decisions,
        idFactory: () => 'decision-recover',
        model: {
          decidePivot: vi.fn(async () => ({
            output: {
              action: 'stop',
              reason: 'Recover the committed stop',
              taskId: 'inspect',
            },
            usage: { costUsd: 0.01, tokens: 10 },
          })),
        },
        states,
      }).decide({
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        trigger: {
          category: 'direction',
          evidenceIds: ['failure-1'],
          summary: 'Direction failed',
          taskId: 'inspect',
        },
      })
      decisions.close()

      const runtime = createRuntime({
        databasePath,
        decidePivot: vi.fn(),
        plans,
        states,
      })
      await runtime.ready

      expect(runtime.findDispatch('decision-recover')).toMatchObject({
        decisionId: 'decision-recover',
        result: { action: 'stop', outcome: 'stopped' },
      })
      expect(states.get(state.runId)?.status).toBe('stopped')

      runtime.deleteForSession('session-1')
      expect(runtime.findDispatch('decision-recover')).toBeNull()
      runtime.close()
      states.close()
      plans.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('owns durable self-repair attempt/assignment evidence and cleans it by Session', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-runtime-repair-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const plans = new AxisShadowRunRegistry(databasePath)
      const states = new AxisRunStateRegistry(databasePath, {
        clock: sequenceClock(),
      })
      const state = failedRun(plans, states, 'run-repair', 'session-1')
      const runtime = createRuntime({
        databasePath,
        decidePivot: vi.fn(async () => ({
          output: {
            action: 'self-repair',
            reason: 'Repair the omitted validation',
            taskId: 'inspect',
          },
          usage: { costUsd: 0.01, tokens: 10 },
        })),
        plans,
        states,
      })
      let resourcesClosed = false
      let result: Awaited<ReturnType<typeof runtime.decideAndDispatch>>
      try {
        const attempts = runtime.openWorkerAttemptLifecyclePort()
        const running = attempts.begin({
          attempt: 1,
          runId: state.runId,
          sessionId: state.sessionId,
          taskId: 'inspect',
          workerId: 'worker-1',
        })
        attempts.finish({
          attemptId: running.attemptId,
          error: 'Worker omitted validation',
          expectedRevision: running.revision,
          runId: running.runId,
          sessionId: running.sessionId,
          status: 'failed',
          taskId: running.taskId,
          workerId: running.workerId,
        })

        result = await runtime.decideAndDispatch({
          expectedRevision: state.revision,
          runId: state.runId,
          sessionId: state.sessionId,
          trigger: {
            category: 'minor',
            evidenceIds: ['review-1'],
            summary: 'A narrow validation was omitted',
            taskId: 'inspect',
          },
        })

        expect(result).toMatchObject({
          route: 'continuation',
          result: {
            action: 'self-repair',
            assignment: { workerId: 'worker-1' },
            outcome: 'assigned',
          },
        })
        runtime.deleteForSession('session-1')
        expect(runtime.findDispatch(result.decisionId)).toBeNull()
        runtime.close()
        states.close()
        plans.close()
        resourcesClosed = true
      } finally {
        if (!resourcesClosed) {
          runtime.close()
          states.close()
          plans.close()
        }
      }

      const reopenedAttempts = new AxisWorkerAttemptRegistry(databasePath)
      try {
        expect(reopenedAttempts.openReaderPort().findLatest({
          runId: state.runId,
          sessionId: state.sessionId,
          taskId: 'inspect',
        })).toBeNull()
        expect(reopenedAttempts.openAssignmentPort().findByDecision(
          result.decisionId,
        )).toBeNull()
      } finally {
        reopenedAttempts.close()
      }
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('observes authoritative task failure once and persists a continuation handoff', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-observe-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const plans = new AxisShadowRunRegistry(databasePath)
      const states = new AxisRunStateRegistry(databasePath, {
        clock: sequenceClock(),
      })
      const state = failedRun(plans, states, 'run-observe', 'session-1')
      const decidePivot = vi.fn(async () => ({
        output: {
          action: 'self-repair' as const,
          reason: 'Repair the failed dry-run attempt',
          taskId: 'inspect',
        },
        usage: { costUsd: 0.01, tokens: 10 },
      }))
      const runtime = createRuntime({
        databasePath,
        decidePivot,
        plans,
        states,
      })
      const attempts = runtime.openWorkerAttemptLifecyclePort()
      const running = attempts.begin({
        attempt: 1,
        runId: state.runId,
        sessionId: state.sessionId,
        taskId: 'inspect',
        workerId: 'dry-run-worker',
      })
      attempts.finish({
        attemptId: running.attemptId,
        error: 'Worker failed',
        expectedRevision: running.revision,
        runId: running.runId,
        sessionId: running.sessionId,
        status: 'failed',
        taskId: running.taskId,
        workerId: running.workerId,
      })
      const request = {
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
      }

      const result = await runtime.observeFailure(request)
      expect(result).toMatchObject({
        route: 'continuation',
        result: { action: 'self-repair', outcome: 'assigned' },
      })
      const evidence = runtime.findFailureEvidence(
        state.runId,
        state.revision,
      )
      expect(evidence).toMatchObject({
        category: 'minor',
        runId: state.runId,
        sourceEventRevision: state.revision,
        summary: 'Worker failed',
        taskId: 'inspect',
      })
      expect(runtime.findContinuation(result.decisionId)).toMatchObject({
        action: 'self-repair',
        decisionId: result.decisionId,
        failureEvidenceId: evidence?.evidenceId,
        status: 'pending-guarded-review',
        targetRunId: state.runId,
      })
      await expect(runtime.observeFailure(request)).resolves.toEqual(result)
      expect(decidePivot).toHaveBeenCalledOnce()
      runtime.close()
      states.close()
      plans.close()

      const reopenedPlans = new AxisShadowRunRegistry(databasePath)
      const reopenedStates = new AxisRunStateRegistry(databasePath)
      const reopened = createRuntime({
        databasePath,
        decidePivot: vi.fn(),
        plans: reopenedPlans,
        states: reopenedStates,
      })
      await reopened.ready
      expect(reopened.findFailureEvidence(
        state.runId,
        state.revision,
      )).toEqual(evidence)
      expect(reopened.findContinuation(result.decisionId)).toMatchObject({
        decisionId: result.decisionId,
      })
      reopened.deleteForSession(state.sessionId)
      expect(reopened.findFailureEvidence(
        state.runId,
        state.revision,
      )).toBeNull()
      expect(reopened.findContinuation(result.decisionId)).toBeNull()
      reopened.close()
      reopenedStates.close()
      reopenedPlans.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('classifies an authoritative post-retry task failure as direction evidence', async () => {
    const plans = new AxisShadowRunRegistry()
    const states = new AxisRunStateRegistry(':memory:', {
      clock: sequenceClock(),
    })
    let state = failedRun(plans, states, 'run-direction', 'session-1')
    state = states.recordPivot({
      decision: {
        action: 'retry',
        reason: 'Retry once before changing direction',
        taskId: 'inspect',
      },
      decisionDurationMs: 1,
      decisionId: 'decision-retry-1',
      expectedRevision: state.revision,
      modelUsage: { costUsd: 0, tokens: 0 },
      runId: state.runId,
      sessionId: state.sessionId,
    })
    state = states.schedulePivotRetry({
      decisionId: 'decision-retry-1',
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
      taskId: 'inspect',
    })
    state = states.claimGuardedTask({
      dependencyTaskIds: [],
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
      taskId: 'inspect',
    })
    state = states.finishGuardedTask({
      expectedRevision: state.revision,
      result: {
        artifacts: [],
        findings: ['Gate rejected the retry'],
        status: 'failed',
        summary: 'Guarded retry failed its Gate',
        taskId: 'inspect',
        usage: { costUsd: 0, durationMs: 1, tokens: 0 },
      },
      runId: state.runId,
      sessionId: state.sessionId,
    })
    const decidePivot = vi.fn(async () => ({
      output: {
        action: 'stop' as const,
        reason: 'Stop after confirming direction evidence',
        taskId: 'inspect',
      },
      usage: { costUsd: 0, tokens: 0 },
    }))
    const runtime = createRuntime({
      databasePath: ':memory:',
      decidePivot,
      plans,
      states,
    })

    const result = await runtime.observeFailure({
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
    })

    expect(result.route).toBe('terminal')
    expect(decidePivot).toHaveBeenCalledWith(expect.objectContaining({
      trigger: expect.objectContaining({ category: 'direction' }),
    }))
    expect(runtime.findFailureEvidence(state.runId, state.revision)).toMatchObject({
      category: 'direction',
      retryDecisionId: 'decision-retry-1',
      schemaVersion: 2,
      source: 'post-retry-task-failure',
      taskId: 'inspect',
    })
    runtime.close()
    states.close()
    plans.close()
  })

  it('keeps observed terminal failure dispatches out of continuation handoff', async () => {
    const plans = new AxisShadowRunRegistry()
    const states = new AxisRunStateRegistry(':memory:', {
      clock: sequenceClock(),
    })
    const state = failedRun(plans, states, 'run-terminal', 'session-1')
    const runtime = createRuntime({
      databasePath: ':memory:',
      decidePivot: vi.fn(async () => ({
        output: {
          action: 'stop',
          reason: 'Stop the failed dry run',
          taskId: 'inspect',
        },
        usage: { costUsd: 0.01, tokens: 10 },
      })),
      plans,
      states,
    })

    const result = await runtime.observeFailure({
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
    })
    expect(result.route).toBe('terminal')
    expect(runtime.findContinuation(result.decisionId)).toBeNull()
    await expect(runtime.observeFailure({
      expectedRevision: state.revision + 1,
      runId: state.runId,
      sessionId: state.sessionId,
    })).rejects.toThrow(/revision|task-failed/i)
    runtime.close()
    states.close()
    plans.close()
  })
})

function createRuntime(options: {
  databasePath: string
  decidePivot: ReturnType<typeof vi.fn>
  plans: AxisShadowRunRegistry
  states: AxisRunStateRegistry
}) {
  const runtime = createAxisProductionPivotRuntime({
    databasePath: options.databasePath,
    feature: resolveAxisDynamicPivotFeature({
      PIVOT_AXIS_DYNAMIC_PIVOT: '1',
    }),
    files: { list: async () => [] },
    modelFactory: () => ({ decidePivot: options.decidePivot }),
    plannerFactory: () => ({
      plan: async () => {
        throw new Error('Unexpected replan')
      },
    }),
    plans: options.plans,
    projects: { findBySession: () => null },
    states: options.states,
  })
  if (!runtime) throw new Error('Expected enabled Dynamic Pivot runtime')
  return runtime
}

function failedRun(
  plans: AxisShadowRunRegistry,
  states: AxisRunStateRegistry,
  runId: string,
  sessionId: string,
) {
  const plan = plans.save(axisShadowResult(runId, sessionId))
  let state = states.create(plan, {
    ...axisBudget(),
    maxPivots: 3,
    maxRetriesPerTask: 2,
  })
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
      summary: 'Worker failed',
      taskId: 'inspect',
      usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
    },
    runId,
    sessionId,
  })
}

function unusedPlans() {
  return {
    delete: () => undefined,
    get: () => null,
    save: () => {
      throw new Error('unused')
    },
  }
}

function unusedStates() {
  return {
    create: () => {
      throw new Error('unused')
    },
    delete: () => undefined,
    get: () => null,
    openPivotActionReaderPort: () => ({ find: () => null }),
    openPivotAssignmentStatePort: () => ({
      find: () => null,
      scheduleAssignment: () => {
        throw new Error('unused')
      },
    }),
    openPivotRetryStatePort: () => ({
      find: () => null,
      scheduleRetry: () => {
        throw new Error('unused')
      },
    }),
    openPivotStopStatePort: () => ({
      find: () => null,
      stopPivot: () => {
        throw new Error('unused')
      },
    }),
    recordPivot: () => {
      throw new Error('unused')
    },
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-30T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
