import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotRetryActionHandler } from '../../src/main/services/axis-pivot-retry-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import {
  AxisRunStateSchema,
  type AxisPivotAction,
  type AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import { scheduleAxisPivotTaskRetry } from '../../src/shared/axis-run-state'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot retry action handler', () => {
  it('schedules one failed task retry and returns the durable event', async () => {
    const harness = await decidedHarness('retry')
    const handler = new AxisPivotRetryActionHandler({
      decisions: harness.decisions.openActionReaderPort(),
      states: harness.states.openPivotRetryStatePort(),
    })

    const result = handler.execute(actionRequest(harness.state))
    const persisted = harness.states.get(harness.state.runId)!

    expect(result).toMatchObject({
      decisionId: harness.decisionId,
      executionRevision: harness.state.revision,
      outcome: 'scheduled',
      stateRevision: harness.state.revision + 1,
      taskId: 'inspect',
    })
    expect(persisted).toMatchObject({
      revision: harness.state.revision + 1,
      status: 'running',
      tasks: [{ attempts: 1, error: null, status: 'pending' }],
      usage: { retriesForTask: 1 },
    })
    harness.close()
  })

  it('returns already-scheduled on repeat without consuming another retry or revision', async () => {
    const harness = await decidedHarness('retry')
    const handler = new AxisPivotRetryActionHandler({
      decisions: harness.decisions.openActionReaderPort(),
      states: harness.states.openPivotRetryStatePort(),
    })
    const request = actionRequest(harness.state)

    const first = handler.execute(request)
    const repeated = handler.execute(request)
    const persisted = harness.states.get(harness.state.runId)!

    expect(first.outcome).toBe('scheduled')
    expect(repeated).toMatchObject({
      event: first.event,
      outcome: 'already-scheduled',
      stateRevision: first.stateRevision,
    })
    expect(persisted.revision).toBe(harness.state.revision + 1)
    expect(persisted.usage.retriesForTask).toBe(1)
    harness.close()
  })

  it('rejects a non-retry decision before changing Run state', async () => {
    const harness = await decidedHarness('replan')
    const handler = new AxisPivotRetryActionHandler({
      decisions: harness.decisions.openActionReaderPort(),
      states: harness.states.openPivotRetryStatePort(),
    })

    expect(() => handler.execute(actionRequest(harness.state))).toThrow(/retry/i)
    expect(harness.states.get(harness.state.runId)).toEqual(harness.state)
    harness.close()
  })

  it('rejects stale revisions and cross-Session requests', async () => {
    const harness = await decidedHarness('retry')
    const handler = new AxisPivotRetryActionHandler({
      decisions: harness.decisions.openActionReaderPort(),
      states: harness.states.openPivotRetryStatePort(),
    })

    expect(() => handler.execute({
      ...actionRequest(harness.state),
      expectedRevision: harness.state.revision - 1,
    })).toThrow(/revision/i)
    expect(() => handler.execute({
      ...actionRequest(harness.state),
      sessionId: 'session-other',
    })).toThrow(/ownership/i)
    expect(harness.states.get(harness.state.runId)).toEqual(harness.state)
    harness.close()
  })

  it('validates the retry Port response before returning success', async () => {
    const harness = await decidedHarness('retry')
    const malformed = AxisRunStateSchema.parse({
      ...harness.state,
      sessionId: 'session-other',
    })
    const states = {
      find: vi.fn(() => harness.state),
      scheduleRetry: vi.fn(() => malformed),
    }
    const handler = new AxisPivotRetryActionHandler({
      decisions: harness.decisions.openActionReaderPort(),
      states,
    })

    expect(() => handler.execute(actionRequest(harness.state))).toThrow(/ownership|result/i)
    expect(states.scheduleRetry).toHaveBeenCalledTimes(1)
    harness.close()
  })

  it('recovers a concurrent revision conflict only when the same decision is already scheduled', async () => {
    const harness = await decidedHarness('retry')
    const scheduled = scheduleAxisPivotTaskRetry(
      harness.state,
      harness.decisionId,
      'inspect',
      '2026-07-29T00:00:10.000Z',
    )
    const states = {
      find: vi.fn()
        .mockReturnValueOnce(harness.state)
        .mockReturnValueOnce(scheduled),
      scheduleRetry: vi.fn(() => {
        throw new Error('Axis run state revision conflict')
      }),
    }
    const handler = new AxisPivotRetryActionHandler({
      decisions: harness.decisions.openActionReaderPort(),
      states,
    })

    expect(handler.execute(actionRequest(harness.state))).toMatchObject({
      outcome: 'already-scheduled',
      stateRevision: scheduled.revision,
    })
    expect(states.scheduleRetry).toHaveBeenCalledTimes(1)
    expect(states.find).toHaveBeenCalledTimes(2)
    harness.close()
  })
})

async function decidedHarness(action: AxisPivotAction) {
  const decisions = new AxisPivotDecisionRegistry(':memory:', { clock: sequenceClock() })
  const states = new AxisRunStateRegistry(':memory:', { clock: sequenceClock() })
  const budget = { ...axisBudget(), maxPivots: 3, maxRetriesPerTask: 2 }
  let state = states.create(axisShadowResult('run-retry', 'session-1'), budget)
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
  state = states.completeTask({
    expectedRevision: state.revision,
    result: {
      artifacts: [],
      findings: [],
      status: 'failed',
      summary: 'Worker failed',
      taskId: 'inspect',
      usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
    },
    runId: state.runId,
    sessionId: state.sessionId,
  })
  const decisionId = `pivot-${action}`
  const coordinator = new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: { action, reason: `Route through ${action}`, taskId: 'inspect' },
        usage: { costUsd: 0.01, tokens: 10 },
      })),
    },
    states,
  })
  await coordinator.decide({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    trigger: {
      category: 'direction',
      evidenceIds: ['review-1'],
      summary: 'The current task execution failed',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  return {
    close() {
      decisions.close()
      states.close()
    },
    decisionId,
    decisions,
    state,
    states,
  }
}

function actionRequest(state: AxisRunState) {
  return {
    decisionId: state.events.at(-1)!.pivotDecisionId!,
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(`2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`)
}
