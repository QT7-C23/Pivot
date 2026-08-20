import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotSelfRepairActionHandler } from '../../src/main/services/axis-pivot-self-repair-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import type {
  AxisPivotDecisionRecord,
  AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import type {
  AxisSelfRepairAssignment,
  AxisWorkerAttemptBinding,
} from '../../src/shared/axis-worker-attempt-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot self-repair action handler', () => {
  it('assigns the failed task to the same Worker and schedules authoritative execution', async () => {
    const harness = await decidedHarness()
    const handler = createHandler(harness)

    const result = handler.execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      decisionId: harness.decision.decisionId,
      executionRevision: harness.state.revision,
      outcome: 'assigned',
      scheduleOutcome: 'scheduled',
      schemaVersion: 2,
      stateRevision: harness.state.revision + 1,
      taskId: 'inspect',
      workerId: harness.attempt.workerId,
    })
    expect(result.assignment).toMatchObject({
      issue: harness.decision.decision!.reason,
      sourceAttempt: harness.attempt.attempt,
      sourceAttemptId: harness.attempt.attemptId,
      workerId: harness.attempt.workerId,
    })
    expect(harness.states.get(harness.state.runId)).toMatchObject({
      revision: harness.state.revision + 1,
      status: 'running',
      tasks: [expect.objectContaining({ status: 'pending', taskId: 'inspect' })],
      usage: {
        retriesForTask: harness.state.usage.retriesForTask + 1,
      },
    })
    expect(result.event).toMatchObject({
      pivotDecisionId: harness.decision.decisionId,
      taskId: 'inspect',
      type: 'pivot-self-repair-scheduled',
    })
    harness.close()
  })

  it('returns already-assigned on repeat without creating another assignment', async () => {
    const harness = await decidedHarness()
    const handler = createHandler(harness)
    const request = actionRequest(harness.state)

    const first = handler.execute(request)
    const repeated = handler.execute(request)

    expect(first.outcome).toBe('assigned')
    expect(repeated).toEqual({ ...first,
      outcome: 'already-assigned',
      scheduleOutcome: 'already-scheduled',
    })
    expect(harness.attempts.openAssignmentPort().findByDecision(
      harness.decision.decisionId,
    )).toEqual(first.assignment)
    harness.close()
  })

  it('rejects non-self-repair, non-minor, and forced decisions', async () => {
    const harness = await decidedHarness()
    const variants: AxisPivotDecisionRecord[] = [
      {
        ...harness.decision,
        decision: { action: 'retry', reason: 'Retry instead', taskId: 'inspect' },
      },
      {
        ...harness.decision,
        trigger: { ...harness.decision.trigger, category: 'direction' },
      },
      {
        ...harness.decision,
        forced: true,
      },
    ]

    for (const decision of variants) {
      const handler = new AxisPivotSelfRepairActionHandler({
        assignments: harness.attempts.openAssignmentPort(),
        attempts: harness.attempts.openReaderPort(),
        decisions: { find: () => decision },
        states: harness.states.openPivotAssignmentStatePort(),
      })
      expect(() => handler.execute(actionRequest(harness.state))).toThrow(
        /self-repair|minor|forced|executable/i,
      )
    }
    expect(harness.attempts.openAssignmentPort().findByDecision(
      harness.decision.decisionId,
    )).toBeNull()
    harness.close()
  })

  it('rejects stale and cross-Session requests before assignment', async () => {
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
    expect(harness.attempts.openAssignmentPort().findByDecision(
      harness.decision.decisionId,
    )).toBeNull()
    harness.close()
  })

  it('rejects a running, completed, or attempt-count-mismatched Worker binding', async () => {
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
      const handler = new AxisPivotSelfRepairActionHandler({
        assignments: harness.attempts.openAssignmentPort(),
        attempts: { findLatest: () => attempt },
        decisions: harness.decisions.openActionReaderPort(),
        states: harness.states.openPivotAssignmentStatePort(),
      })
      expect(() => handler.execute(actionRequest(harness.state))).toThrow(
        /failed|attempt/i,
      )
    }
    harness.close()
  })

  it('rejects exhausted retry, token, cost, duration, or gate budgets', async () => {
    const harness = await decidedHarness()
    const exhausted = [
      {
        budget: { ...harness.state.budget, maxRetriesPerTask: 0 },
        usage: harness.state.usage,
      },
      {
        budget: harness.state.budget,
        usage: { ...harness.state.usage, tokens: harness.state.budget.maxTokens },
      },
      {
        budget: harness.state.budget,
        usage: { ...harness.state.usage, costUsd: harness.state.budget.maxCostUsd },
      },
      {
        budget: harness.state.budget,
        usage: { ...harness.state.usage, durationMs: harness.state.budget.maxDurationMs },
      },
      {
        budget: harness.state.budget,
        usage: {
          ...harness.state.usage,
          gateCyclesForFile: harness.state.budget.maxGateCyclesPerFile,
        },
      },
    ]

    for (const variant of exhausted) {
      const state = {
        ...harness.state,
        budget: variant.budget,
        usage: variant.usage,
      }
      const decision = {
        ...harness.decision,
        budget: variant.budget,
        modelUsage: { costUsd: 0, tokens: 0 },
        usageBefore: {
          ...variant.usage,
          pivots: variant.usage.pivots - 1,
        },
      }
      const handler = new AxisPivotSelfRepairActionHandler({
        assignments: harness.attempts.openAssignmentPort(),
        attempts: harness.attempts.openReaderPort(),
        decisions: { find: () => decision },
        states: { find: () => state, scheduleAssignment: vi.fn() },
      })
      expect(() => handler.execute(actionRequest(state))).toThrow(/budget|limit/i)
    }
    harness.close()
  })

  it('validates untrusted Port responses and only recovers matching concurrent evidence', async () => {
    const harness = await decidedHarness()
    const malformed = {
      ...assignmentFor(harness),
      workerId: 'worker-other',
    }
    const malformedHandler = new AxisPivotSelfRepairActionHandler({
      assignments: {
        assign: vi.fn(() => malformed),
        findByDecision: vi.fn(() => null),
      },
      attempts: harness.attempts.openReaderPort(),
      decisions: harness.decisions.openActionReaderPort(),
      states: harness.states.openPivotAssignmentStatePort(),
    })

    expect(() => malformedHandler.execute(actionRequest(harness.state))).toThrow(
      /ownership|worker|assignment/i,
    )

    const concurrent = assignmentFor(harness)
    const assignments = {
      assign: vi.fn(() => {
        throw new Error('unique decision conflict')
      }),
      findByDecision: vi.fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(concurrent),
    }
    const concurrentHandler = new AxisPivotSelfRepairActionHandler({
      assignments,
      attempts: harness.attempts.openReaderPort(),
      decisions: harness.decisions.openActionReaderPort(),
      states: harness.states.openPivotAssignmentStatePort(),
    })

    expect(concurrentHandler.execute(actionRequest(harness.state))).toMatchObject({
      assignment: concurrent,
      outcome: 'already-assigned',
    })
    expect(assignments.assign).toHaveBeenCalledTimes(1)
    expect(assignments.findByDecision).toHaveBeenCalledTimes(2)
    harness.close()
  })
})

function createHandler(harness: Awaited<ReturnType<typeof decidedHarness>>) {
  return new AxisPivotSelfRepairActionHandler({
    assignments: harness.attempts.openAssignmentPort(),
    attempts: harness.attempts.openReaderPort(),
    decisions: harness.decisions.openActionReaderPort(),
    states: harness.states.openPivotAssignmentStatePort(),
  })
}

async function decidedHarness() {
  const decisions = new AxisPivotDecisionRegistry(':memory:', {
    clock: sequenceClock(),
  })
  const states = new AxisRunStateRegistry(':memory:', {
    clock: sequenceClock(),
  })
  let id = 0
  const attempts = new AxisWorkerAttemptRegistry(':memory:', {
    clock: sequenceClock(),
    idFactory: (kind) => `${kind}-${++id}`,
  })
  const budget = {
    ...axisBudget(),
    maxGateCyclesPerFile: 2,
    maxPivots: 3,
    maxRetriesPerTask: 2,
  }
  let state = states.create(axisShadowResult('run-self-repair', 'session-1'), budget)
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
      summary: 'Worker omitted validation',
      taskId: 'inspect',
      usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
    },
    runId: state.runId,
    sessionId: state.sessionId,
  })
  const attempt = attempts.openLifecyclePort().finish({
    attemptId: running.attemptId,
    error: 'Worker omitted validation',
    expectedRevision: running.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    status: 'failed',
    taskId: 'inspect',
    workerId: 'worker-1',
  })
  const decisionId = 'pivot-self-repair'
  await new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: {
          action: 'self-repair',
          reason: 'Repair the omitted validation',
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
      category: 'minor',
      evidenceIds: ['review-1'],
      summary: 'A narrow validation was omitted',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  const decision = decisions.get(decisionId)!
  return {
    attempt,
    attempts,
    close() {
      attempts.close()
      decisions.close()
      states.close()
    },
    decision,
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

function assignmentFor(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
): AxisSelfRepairAssignment {
  return {
    assignmentId: 'assignment-concurrent',
    createdAt: '2026-07-29T00:00:10.000Z',
    decisionId: harness.decision.decisionId,
    executionRevision: harness.state.revision,
    issue: harness.decision.decision!.reason,
    runId: harness.state.runId,
    schemaVersion: 1,
    sessionId: harness.state.sessionId,
    sourceAttempt: harness.attempt.attempt,
    sourceAttemptId: harness.attempt.attemptId,
    status: 'assigned',
    taskId: 'inspect',
    workerId: harness.attempt.workerId,
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
