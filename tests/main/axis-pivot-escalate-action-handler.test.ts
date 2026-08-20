import { describe, expect, it, vi } from 'vitest'
import { AxisHumanEscalationRegistry } from '../../src/main/services/axis-human-escalation-registry'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotEscalateActionHandler } from '../../src/main/services/axis-pivot-escalate-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import type {
  AxisPivotDecisionRecord,
  AxisRunState,
} from '../../src/shared/axis-engine-contracts'
import type {
  AxisHumanEscalationReceipt,
} from '../../src/shared/axis-human-escalation-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot escalate action handler', () => {
  it('opens human attention without mutating Run state', async () => {
    const harness = await decidedHarness()

    const result = createHandler(harness).execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      decisionId: harness.decision.decisionId,
      outcome: 'opened',
      taskId: 'inspect',
    })
    expect(result.receipt).toMatchObject({
      category: 'security',
      evidenceIds: harness.decision.trigger.evidenceIds,
      reason: harness.decision.decision!.reason,
      summary: harness.decision.trigger.summary,
    })
    expect(harness.states.get(harness.state.runId)).toEqual(harness.state)
    harness.close()
  })

  it('accepts a taskless design escalation from a paused Run', async () => {
    const harness = await pausedDecisionHarness()

    const result = createHandler(harness).execute(actionRequest(harness.state))

    expect(result).toMatchObject({
      outcome: 'opened',
      taskId: null,
      receipt: {
        category: 'design',
        taskId: null,
      },
    })
    expect(harness.states.get(harness.state.runId)).toEqual(harness.state)
    harness.close()
  })

  it('returns already-open on repeat without creating again', async () => {
    const harness = await decidedHarness()
    const realPort = harness.escalations.openEscalationPort()
    const open = vi.fn((input: Parameters<typeof realPort.open>[0]) => (
      realPort.open(input)
    ))
    const handler = createHandler(harness, {
      escalations: {
        findByDecision: (decisionId) => realPort.findByDecision(decisionId),
        open,
      },
    })
    const request = actionRequest(harness.state)

    const first = handler.execute(request)
    const repeated = handler.execute(request)

    expect(first.outcome).toBe('opened')
    expect(repeated).toEqual({ ...first, outcome: 'already-open' })
    expect(open).toHaveBeenCalledTimes(1)
    harness.close()
  })

  it('rejects wrong action, unsupported category, and forced decisions', async () => {
    const harness = await decidedHarness()
    const variants: AxisPivotDecisionRecord[] = [
      {
        ...harness.decision,
        decision: { action: 'replan', reason: 'wrong', taskId: 'inspect' },
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
      expect(() => createHandler(harness, {
        decisions: { find: () => decision },
      }).execute(actionRequest(harness.state))).toThrow(
        /escalat|category|forced|validation/i,
      )
    }
    expect(harness.escalations.openEscalationPort().findByDecision(
      harness.decision.decisionId,
    )).toBeNull()
    harness.close()
  })

  it('rejects stale revision, cross-Session ownership, and stale latest event', async () => {
    const harness = await decidedHarness()

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
      },
    }).execute(actionRequest(harness.state))).toThrow(/latest|event/i)
    harness.close()
  })

  it('rejects malformed evidence and recovers only matching concurrency', async () => {
    const harness = await decidedHarness()
    const malformed = {
      ...receiptFor(harness),
      summary: 'forged summary',
    }
    expect(() => createHandler(harness, {
      escalations: {
        findByDecision: () => null,
        open: () => malformed,
      },
    }).execute(actionRequest(harness.state))).toThrow(
      /evidence|summary|ownership/i,
    )

    const concurrent = receiptFor(harness)
    const escalations = {
      findByDecision: vi.fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(concurrent),
      open: vi.fn(() => {
        throw new Error('unique decision conflict')
      }),
    }
    expect(createHandler(harness, { escalations }).execute(
      actionRequest(harness.state),
    )).toMatchObject({
      outcome: 'already-open',
      receipt: concurrent,
    })
    expect(escalations.open).toHaveBeenCalledTimes(1)
    harness.close()
  })
})

function createHandler(
  harness: Awaited<ReturnType<typeof decidedHarness>>,
  overrides: Partial<ConstructorParameters<
    typeof AxisPivotEscalateActionHandler
  >[0]> = {},
) {
  return new AxisPivotEscalateActionHandler({
    decisions: harness.decisions.openActionReaderPort(),
    escalations: harness.escalations.openEscalationPort(),
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
  const escalations = new AxisHumanEscalationRegistry(':memory:', {
    clock: sequenceClock(),
    idFactory: () => 'escalation-1',
  })
  const budget = { ...axisBudget(), maxPivots: 3 }
  let state = states.create(
    axisShadowResult('run-escalate', 'session-1'),
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
      summary: 'Security-sensitive review failure',
      taskId: 'inspect',
      usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
    },
    runId: state.runId,
    sessionId: state.sessionId,
  })
  const decisionId = 'pivot-escalate'
  await new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: {
          action: 'escalate',
          reason: 'A human must assess the security impact',
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
      evidenceIds: ['review-1'],
      summary: 'The review found a security-sensitive conflict',
      taskId: 'inspect',
    },
  })
  state = states.get(state.runId)!
  const decision = decisions.get(decisionId)!
  return {
    close() {
      escalations.close()
      decisions.close()
      states.close()
    },
    decision,
    decisions,
    escalations,
    state,
    states,
  }
}

async function pausedDecisionHarness() {
  const decisions = new AxisPivotDecisionRegistry(':memory:', {
    clock: sequenceClock(),
  })
  const states = new AxisRunStateRegistry(':memory:', {
    clock: sequenceClock(),
  })
  const escalations = new AxisHumanEscalationRegistry(':memory:', {
    clock: sequenceClock(),
    idFactory: () => 'escalation-paused',
  })
  let state = states.create(
    axisShadowResult('run-escalate-paused', 'session-1'),
    { ...axisBudget(), maxPivots: 3 },
  )
  state = states.startDryRun({
    approvedTaskIds: ['inspect'],
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  })
  state = states.pause({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    stopReason: 'time-limit',
  })
  const decisionId = 'pivot-escalate-paused'
  await new AxisPivotCoordinator({
    clock: sequenceClock(),
    decisions,
    idFactory: () => decisionId,
    model: {
      decidePivot: vi.fn(async () => ({
        output: {
          action: 'escalate',
          reason: 'A human must choose the revised design direction',
          taskId: null,
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
      category: 'design',
      evidenceIds: ['design-conflict-1'],
      summary: 'Two valid designs require a product decision',
      taskId: null,
    },
  })
  state = states.get(state.runId)!
  const decision = decisions.get(decisionId)!
  return {
    close() {
      escalations.close()
      decisions.close()
      states.close()
    },
    decision,
    decisions,
    escalations,
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
): AxisHumanEscalationReceipt {
  return {
    category: 'security',
    decisionId: harness.decision.decisionId,
    escalationId: 'escalation-concurrent',
    evidenceIds: harness.decision.trigger.evidenceIds,
    executionRevision: harness.state.revision,
    openedAt: '2026-07-30T00:00:10.000Z',
    reason: harness.decision.decision!.reason,
    runId: harness.state.runId,
    schemaVersion: 1,
    sessionId: harness.state.sessionId,
    status: 'open',
    summary: harness.decision.trigger.summary,
    taskId: 'inspect',
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-30T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
