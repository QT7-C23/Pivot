import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotDiscardActionHandler } from '../../src/main/services/axis-pivot-discard-action-handler'
import { axisRemainingBudget } from '../../src/main/services/axis-pivot-policy'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import { AxisWorkerDiscardRegistry } from '../../src/main/services/axis-worker-discard-registry'
import type {
  AxisPivotDecisionRecord,
  AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import type {
  AxisWorkerAttemptBinding,
} from '../../src/shared/axis-worker-attempt-contracts'
import type {
  AxisWorkerDiscardReceipt,
} from '../../src/shared/axis-worker-discard-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot discard action handler', () => {
  it('records failed Worker disposition without mutating Run state', async () => {
    const harness = await decidedHarness()

    const result = createHandler(harness).execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      decisionId: harness.decision.decisionId,
      outcome: 'discarded',
      taskId: 'inspect',
      workerId: harness.attempt.workerId,
    })
    expect(result.receipt).toMatchObject({
      reason: harness.decision.decision!.reason,
      sourceAttemptId: harness.attempt.attemptId,
      sourceWorkerId: harness.attempt.workerId,
    })
    expect(harness.states.get(harness.state.runId)).toEqual(harness.state)
    harness.close()
  })

  it('returns already-discarded on repeat without creating again', async () => {
    const harness = await decidedHarness()
    const realPort = harness.discards.openDiscardPort()
    const discard = vi.fn((input: Parameters<typeof realPort.discard>[0]) => (
      realPort.discard(input)
    ))
    const handler = createHandler(harness, {
      discards: {
        discard,
        findByDecision: (decisionId) => realPort.findByDecision(decisionId),
      },
    })
    const request = actionRequest(harness.state)

    const first = handler.execute(request)
    const repeated = handler.execute(request)

    expect(first.outcome).toBe('discarded')
    expect(repeated).toEqual({ ...first, outcome: 'already-discarded' })
    expect(discard).toHaveBeenCalledTimes(1)
    harness.close()
  })

  it('rejects wrong action, non-excessive category, and forced decisions', async () => {
    const harness = await decidedHarness()
    const variants: AxisPivotDecisionRecord[] = [
      {
        ...harness.decision,
        decision: { action: 'replan', reason: 'wrong', taskId: 'inspect' },
      },
      {
        ...harness.decision,
        trigger: { ...harness.decision.trigger, category: 'design' },
      },
      {
        ...harness.decision,
        forced: true,
      },
    ]

    for (const decision of variants) {
      const handler = createHandler(harness, {
        decisions: { find: () => decision },
      })
      expect(() => handler.execute(actionRequest(harness.state))).toThrow(
        /discard|excessive|forced|validation/i,
      )
    }
    expect(harness.discards.openDiscardPort().findByDecision(
      harness.decision.decisionId,
    )).toBeNull()
    harness.close()
  })

  it('rejects stale revisions and cross-Session ownership', async () => {
    const harness = await decidedHarness()
    const handler = createHandler(harness)

    expect(() => handler.execute({
      ...actionRequest(harness.state),
      expectedRevision: harness.state.revision - 1,
    })).toThrow(/revision/i)
    expect(() => handler.execute({
      ...actionRequest(harness.state),
      sessionId: 'session-other',
    })).toThrow(/ownership/i)
    harness.close()
  })

  it('rejects running, completed, or task-count-mismatched attempts', async () => {
    const harness = await decidedHarness()
    const variants: AxisWorkerAttemptBinding[] = [
      {
        ...harness.attempt,
        error: null,
        finishedAt: null,
        revision: 1,
        status: 'running',
      },
      {
        ...harness.attempt,
        error: null,
        status: 'completed',
      },
      {
        ...harness.attempt,
        attempt: harness.attempt.attempt + 1,
      },
    ]

    for (const attempt of variants) {
      const handler = createHandler(harness, {
        attempts: { findLatest: () => attempt },
      })
      expect(() => handler.execute(actionRequest(harness.state))).toThrow(
        /failed|attempt/i,
      )
    }
    harness.close()
  })

  it('records terminal disposition even when continuation budgets are exhausted', async () => {
    const harness = await decidedHarness()
    const usage = {
      ...harness.state.usage,
      costUsd: harness.state.budget.maxCostUsd,
      durationMs: harness.state.budget.maxDurationMs,
      gateCyclesForFile: harness.state.budget.maxGateCyclesPerFile,
      tokens: harness.state.budget.maxTokens,
    }
    const state = { ...harness.state, usage }
    const usageBefore = {
      ...usage,
      pivots: usage.pivots - 1,
    }
    const decision = {
      ...harness.decision,
      decisionDurationMs: 0,
      modelUsage: { costUsd: 0, tokens: 0 },
      remainingBudget: axisRemainingBudget(harness.state.budget, usageBefore),
      usageBefore,
    }
    const handler = createHandler(harness, {
      decisions: { find: () => decision },
      states: { find: () => state },
    })

    expect(handler.execute(actionRequest(state)).outcome).toBe('discarded')
    expect(harness.states.get(harness.state.runId)).toEqual(harness.state)
    harness.close()
  })

  it('rejects malformed evidence and recovers only matching concurrency', async () => {
    const harness = await decidedHarness()
    const malformed = {
      ...receiptFor(harness),
      taskId: 'task-other',
    }
    const malformedHandler = createHandler(harness, {
      discards: {
        discard: () => malformed,
        findByDecision: () => null,
      },
    })
    expect(() => malformedHandler.execute(actionRequest(harness.state))).toThrow(
      /discard|ownership|task/i,
    )

    const concurrent = receiptFor(harness)
    const discards = {
      discard: vi.fn(() => {
        throw new Error('unique decision conflict')
      }),
      findByDecision: vi.fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(concurrent),
    }
    const concurrentHandler = createHandler(harness, { discards })

    expect(concurrentHandler.execute(actionRequest(harness.state))).toMatchObject({
      outcome: 'already-discarded',
      receipt: concurrent,
    })
    expect(discards.discard).toHaveBeenCalledTimes(1)
    harness.close()
  })
})

function createHandler(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
  overrides: Partial<ConstructorParameters<
    typeof AxisPivotDiscardActionHandler
  >[0]> = {},
) {
  return new AxisPivotDiscardActionHandler({
    attempts: harness.attempts.openReaderPort(),
    decisions: harness.decisions.openActionReaderPort(),
    discards: harness.discards.openDiscardPort(),
    states: harness.states.openPivotActionReaderPort(),
    ...overrides,
  })
}

async function decidedHarness() {
  const decisions = new AxisPivotDecisionRegistry(':memory:', {
    clock: sequenceClock(),
  })
  const states = new AxisRunStateRegistry(':memory:', {
    clock: sequenceClock(),
  })
  let identity = 0
  const attempts = new AxisWorkerAttemptRegistry(':memory:', {
    clock: sequenceClock(),
    idFactory: (kind) => `${kind}-${++identity}`,
  })
  const discards = new AxisWorkerDiscardRegistry(':memory:', {
    attempts: attempts.openReaderPort(),
    clock: sequenceClock(),
    idFactory: () => `discard-${++identity}`,
  })
  const budget = {
    ...axisBudget(),
    maxGateCyclesPerFile: 2,
    maxPivots: 3,
    maxRetriesPerTask: 2,
  }
  let state = states.create(axisShadowResult('run-discard', 'session-1'), budget)
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
  const running = attempts.openLifecyclePort().begin({
    attempt: state.tasks[0]!.attempts,
    runId: state.runId,
    sessionId: state.sessionId,
    taskId: 'inspect',
    workerId: 'worker-1',
  })
  state = states.completeTask({
    expectedRevision: state.revision,
    result: {
      artifacts: [],
      findings: [],
      status: 'failed',
      summary: 'Excessive review failures',
      taskId: 'inspect',
      usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
    },
    runId: state.runId,
    sessionId: state.sessionId,
  })
  const attempt = attempts.openLifecyclePort().finish({
    attemptId: running.attemptId,
    error: 'Excessive review failures',
    expectedRevision: running.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    status: 'failed',
    taskId: 'inspect',
    workerId: 'worker-1',
  })
  const decisionId = 'pivot-discard'
  await new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: {
          action: 'discard',
          reason: 'Discard the failed Worker attempt',
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
      category: 'excessive',
      evidenceIds: ['review-failures-1'],
      summary: 'Too many issues across review gates',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  const decision = decisions.get(decisionId)!
  return {
    attempt,
    attempts,
    close() {
      discards.close()
      attempts.close()
      decisions.close()
      states.close()
    },
    decision,
    decisions,
    discards,
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

function receiptFor(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
): AxisWorkerDiscardReceipt {
  return {
    createdAt: '2026-07-30T00:00:10.000Z',
    decisionId: harness.decision.decisionId,
    discardId: 'discard-concurrent',
    executionRevision: harness.state.revision,
    reason: harness.decision.decision!.reason,
    runId: harness.state.runId,
    schemaVersion: 1,
    sessionId: harness.state.sessionId,
    sourceAttempt: harness.attempt.attempt,
    sourceAttemptId: harness.attempt.attemptId,
    sourceWorkerId: harness.attempt.workerId,
    status: 'discarded',
    taskId: 'inspect',
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-30T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
