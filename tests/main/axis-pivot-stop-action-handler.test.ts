import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotStopActionHandler } from '../../src/main/services/axis-pivot-stop-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import type {
  AxisPivotDecisionRecord,
  AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot stop action handler', () => {
  it('stops a failed Run while preserving failed task evidence', async () => {
    const harness = await stopHarness()

    const result = createHandler(harness).execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      forced: false,
      outcome: 'stopped',
      reason: harness.decision.decision!.reason,
      stateRevision: harness.state.revision + 1,
      stopReason: null,
      taskId: 'inspect',
    })
    expect(harness.states.get(harness.state.runId)).toMatchObject({
      status: 'stopped',
      tasks: [{ status: 'failed', taskId: 'inspect' }],
      usage: harness.state.usage,
    })
    harness.close()
  })

  it('accepts a forced budget stop without calling the Provider', async () => {
    const harness = await stopHarness({ forced: true })

    const result = createHandler(harness).execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      forced: true,
      outcome: 'stopped',
      stopReason: 'pivot-limit',
    })
    expect(harness.model.decidePivot).not.toHaveBeenCalled()
    harness.close()
  })

  it('returns already-stopped on repeat without another state transition', async () => {
    const harness = await stopHarness()
    const realPort = harness.states.openPivotStopStatePort()
    const stopPivot = vi.fn((input: Parameters<typeof realPort.stopPivot>[0]) => (
      realPort.stopPivot(input)
    ))
    const handler = createHandler(harness, {
      states: {
        find: (input) => realPort.find(input),
        stopPivot,
      },
    })
    const request = actionRequest(harness.state)

    const first = handler.execute(request)
    const repeated = handler.execute(request)

    expect(first.outcome).toBe('stopped')
    expect(repeated).toEqual({ ...first, outcome: 'already-stopped' })
    expect(stopPivot).toHaveBeenCalledTimes(1)
    harness.close()
  })

  it('rejects wrong action, stale revision, cross-Session ownership, and stale event', async () => {
    const harness = await stopHarness()
    const wrong: AxisPivotDecisionRecord = {
      ...harness.decision,
      decision: {
        action: 'replan',
        reason: 'wrong',
        taskId: 'inspect',
      },
    }

    expect(() => createHandler(harness, {
      decisions: { find: () => wrong },
    }).execute(actionRequest(harness.state))).toThrow(/stop/i)
    expect(() => createHandler(harness).execute({
      ...actionRequest(harness.state),
      expectedRevision: harness.state.revision - 1,
    })).toThrow(/revision/i)
    expect(() => createHandler(harness).execute({
      ...actionRequest(harness.state),
      sessionId: 'session-other',
    })).toThrow(/ownership/i)
    expect(() => createHandler(harness, {
      states: {
        find: () => ({
          ...harness.state,
          events: harness.state.events.slice(0, -1),
        }),
        stopPivot: () => {
          throw new Error('must not transition')
        },
      },
    }).execute(actionRequest(harness.state))).toThrow(/latest|event|validation/i)
    harness.close()
  })

  it('rejects malformed state evidence and recovers a committed concurrent stop', async () => {
    const malformedHarness = await stopHarness()
    const malformedHandler = createHandler(malformedHarness, {
      states: {
        find: () => malformedHarness.state,
        stopPivot: () => ({
          ...malformedHarness.state,
          revision: malformedHarness.state.revision + 1,
          status: 'stopped',
        }),
      },
    })
    expect(() => malformedHandler.execute(
      actionRequest(malformedHarness.state),
    )).toThrow()
    malformedHarness.close()

    const concurrentHarness = await stopHarness()
    const realPort = concurrentHarness.states.openPivotStopStatePort()
    const stopPivot = vi.fn((input: Parameters<typeof realPort.stopPivot>[0]) => {
      realPort.stopPivot(input)
      throw new Error('simulated acknowledgement loss')
    })
    const result = createHandler(concurrentHarness, {
      states: {
        find: (input) => realPort.find(input),
        stopPivot,
      },
    }).execute(actionRequest(concurrentHarness.state))

    expect(result.outcome).toBe('already-stopped')
    expect(stopPivot).toHaveBeenCalledTimes(1)
    concurrentHarness.close()
  })
})

function createHandler(
  harness: Awaited<ReturnType<typeof stopHarness>>,
  overrides: Partial<ConstructorParameters<
    typeof AxisPivotStopActionHandler
  >[0]> = {},
) {
  return new AxisPivotStopActionHandler({
    decisions: harness.decisions.openActionReaderPort(),
    states: harness.states.openPivotStopStatePort(),
    ...overrides,
  })
}

async function stopHarness(options: { forced?: boolean } = {}) {
  const decisions = new AxisPivotDecisionRegistry(':memory:', {
    clock: sequenceClock(),
  })
  const states = new AxisRunStateRegistry(':memory:', {
    clock: sequenceClock(),
  })
  const model = {
    decidePivot: vi.fn(async () => ({
      output: {
        action: 'stop' as const,
        reason: 'Stop after the failed direction',
        taskId: 'inspect',
      },
      usage: { costUsd: 0.01, tokens: 10 },
    })),
  }
  const budget = {
    ...axisBudget(),
    maxPivots: options.forced ? 0 : 3,
  }
  let state = states.create(
    axisShadowResult('run-stop-handler', 'session-1'),
    budget,
  )
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
  const decisionId = options.forced ? 'pivot-stop-forced' : 'pivot-stop'
  await new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model,
    states,
  }).decide({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    trigger: {
      category: 'direction',
      evidenceIds: ['failure-1'],
      summary: 'Execution direction failed',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  const decision = decisions.get(decisionId)!
  return {
    close() {
      decisions.close()
      states.close()
    },
    decision,
    decisions,
    model,
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
  return () => new Date(
    `2026-07-30T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
