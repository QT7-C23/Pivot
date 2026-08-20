import { describe, expect, it, vi } from 'vitest'
import { AxisDedicatedFixerAssignmentRegistry } from '../../src/main/services/axis-dedicated-fixer-assignment-registry'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotDedicatedFixerActionHandler } from '../../src/main/services/axis-pivot-dedicated-fixer-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisSecurityFixerResolverAdapter } from '../../src/main/services/axis-security-fixer-resolver-adapter'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import type {
  AxisPivotDecisionRecord,
  AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import type {
  AxisDedicatedFixerAssignment,
} from '../../src/shared/axis-dedicated-fixer-contracts'
import type {
  AxisWorkerAttemptBinding,
} from '../../src/shared/axis-worker-attempt-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot dedicated Fixer action handler', () => {
  it('assigns a different security Fixer and schedules authoritative execution', async () => {
    const harness = await decidedHarness()

    const result = createHandler(harness).execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      decisionId: harness.decision.decisionId,
      fixerId: 'security-fixer',
      outcome: 'assigned',
      scheduleOutcome: 'scheduled',
      schemaVersion: 2,
      stateRevision: harness.state.revision + 1,
      taskId: 'inspect',
    })
    expect(result.assignment).toMatchObject({
      issue: harness.decision.decision!.reason,
      sourceAttemptId: harness.attempt.attemptId,
      sourceWorkerId: harness.attempt.workerId,
    })
    expect(result.fixerId).not.toBe(result.assignment.sourceWorkerId)
    expect(harness.states.get(harness.state.runId)).toMatchObject({
      revision: harness.state.revision + 1,
      status: 'running',
      tasks: [expect.objectContaining({ status: 'pending', taskId: 'inspect' })],
      usage: { retriesForTask: harness.state.usage.retriesForTask },
    })
    expect(result.event).toMatchObject({
      pivotDecisionId: harness.decision.decisionId,
      taskId: 'inspect',
      type: 'pivot-dedicated-fixer-scheduled',
    })
    harness.close()
  })

  it('returns already-assigned on repeat without resolving or creating again', async () => {
    const harness = await decidedHarness()
    const resolveSecurityFixer = vi.fn(() => securityFixer())
    const handler = new AxisPivotDedicatedFixerActionHandler({
      assignments: harness.assignments.openAssignmentPort(),
      attempts: harness.attempts.openReaderPort(),
      decisions: harness.decisions.openActionReaderPort(),
      fixers: { resolveSecurityFixer },
      states: harness.states.openPivotAssignmentStatePort(),
    })
    const request = actionRequest(harness.state)

    const first = handler.execute(request)
    const repeated = handler.execute(request)

    expect(first.outcome).toBe('assigned')
    expect(repeated).toEqual({ ...first,
      outcome: 'already-assigned',
      scheduleOutcome: 'already-scheduled',
    })
    expect(resolveSecurityFixer).toHaveBeenCalledTimes(1)
    harness.close()
  })

  it('rejects wrong action, non-security category, and forced decisions', async () => {
    const harness = await decidedHarness()
    const variants: AxisPivotDecisionRecord[] = [
      {
        ...harness.decision,
        decision: { action: 'self-repair', reason: 'wrong', taskId: 'inspect' },
      },
      {
        ...harness.decision,
        trigger: { ...harness.decision.trigger, category: 'minor' },
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
        /dedicated|security|forced|executable/i,
      )
    }
    expect(harness.assignments.openAssignmentPort().findByDecision(
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

  it('rejects running, completed, or task-count-mismatched source attempts', async () => {
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

  it('rejects exhausted token, cost, duration, or Gate budgets', async () => {
    const harness = await decidedHarness()
    const variants = [
      { ...harness.state.usage, tokens: harness.state.budget.maxTokens },
      { ...harness.state.usage, costUsd: harness.state.budget.maxCostUsd },
      {
        ...harness.state.usage,
        durationMs: harness.state.budget.maxDurationMs,
      },
      {
        ...harness.state.usage,
        gateCyclesForFile: harness.state.budget.maxGateCyclesPerFile,
      },
    ]

    for (const usage of variants) {
      const state = { ...harness.state, usage }
      const decision = {
        ...harness.decision,
        modelUsage: { costUsd: 0, tokens: 0 },
        usageBefore: { ...usage, pivots: usage.pivots - 1 },
      }
      const handler = createHandler(harness, {
        decisions: { find: () => decision },
        states: { find: () => state, scheduleAssignment: vi.fn() },
      })
      expect(() => handler.execute(actionRequest(state))).toThrow(
        /budget|limit/i,
      )
    }
    harness.close()
  })

  it('rejects malformed identity/evidence and recovers only matching concurrency', async () => {
    const harness = await decidedHarness()
    const sameWorkerHandler = createHandler(harness, {
      fixers: {
        resolveSecurityFixer: () => ({
          ...securityFixer(),
          fixerId: harness.attempt.workerId,
        }),
      },
    })
    expect(() => sameWorkerHandler.execute(actionRequest(harness.state))).toThrow(
      /different|source worker/i,
    )

    const malformed = {
      ...assignmentFor(harness),
      taskId: 'task-other',
    }
    const malformedHandler = createHandler(harness, {
      assignments: {
        assign: () => malformed,
        findByDecision: () => null,
      },
    })
    expect(() => malformedHandler.execute(actionRequest(harness.state))).toThrow(
      /assignment|ownership|task/i,
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
    const concurrentHandler = createHandler(harness, { assignments })
    expect(concurrentHandler.execute(actionRequest(harness.state))).toMatchObject({
      assignment: concurrent,
      outcome: 'already-assigned',
    })
    expect(assignments.assign).toHaveBeenCalledTimes(1)
    harness.close()
  })
})

function createHandler(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
  overrides: Partial<ConstructorParameters<
    typeof AxisPivotDedicatedFixerActionHandler
  >[0]> = {},
) {
  return new AxisPivotDedicatedFixerActionHandler({
    assignments: harness.assignments.openAssignmentPort(),
    attempts: harness.attempts.openReaderPort(),
    decisions: harness.decisions.openActionReaderPort(),
    fixers: new AxisSecurityFixerResolverAdapter().openResolverPort(),
    states: harness.states.openPivotAssignmentStatePort(),
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
  const assignments = new AxisDedicatedFixerAssignmentRegistry(':memory:', {
    attempts: attempts.openReaderPort(),
    clock: sequenceClock(),
    idFactory: () => `fixer-assignment-${++identity}`,
  })
  const budget = {
    ...axisBudget(),
    maxGateCyclesPerFile: 2,
    maxPivots: 3,
    maxRetriesPerTask: 2,
  }
  let state = states.create(axisShadowResult('run-security', 'session-1'), budget)
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
      summary: 'Security review failed',
      taskId: 'inspect',
      usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
    },
    runId: state.runId,
    sessionId: state.sessionId,
  })
  const attempt = attempts.openLifecyclePort().finish({
    attemptId: running.attemptId,
    error: 'Security review failed',
    expectedRevision: running.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    status: 'failed',
    taskId: 'inspect',
    workerId: 'worker-1',
  })
  const decisionId = 'pivot-security'
  await new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: {
          action: 'dedicated-fixer',
          reason: 'Repair the security finding',
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
      category: 'security',
      evidenceIds: ['security-review-1'],
      summary: 'Security review found an unsafe boundary',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  const decision = decisions.get(decisionId)!
  return {
    assignmentPath: ':memory:',
    assignments,
    attempt,
    attempts,
    close() {
      assignments.close()
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

function securityFixer() {
  return {
    fixerId: 'security-fixer',
    role: 'security-fixer' as const,
    schemaVersion: 1 as const,
    specialty: 'security' as const,
  }
}

function assignmentFor(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
): AxisDedicatedFixerAssignment {
  return {
    assignmentId: 'fixer-assignment-concurrent',
    createdAt: '2026-07-29T00:00:10.000Z',
    decisionId: harness.decision.decisionId,
    executionRevision: harness.state.revision,
    fixer: securityFixer(),
    issue: harness.decision.decision!.reason,
    runId: harness.state.runId,
    schemaVersion: 1,
    sessionId: harness.state.sessionId,
    sourceAttempt: harness.attempt.attempt,
    sourceAttemptId: harness.attempt.attemptId,
    sourceWorkerId: harness.attempt.workerId,
    status: 'assigned',
    taskId: 'inspect',
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
