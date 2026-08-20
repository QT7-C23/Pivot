import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisHumanEscalationRegistry } from '../../src/main/services/axis-human-escalation-registry'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotEscalateActionHandler } from '../../src/main/services/axis-pivot-escalate-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot escalate Main persistence', () => {
  it('reuses one attention receipt after every Registry reopens', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-escalate-'))
    const decisionPath = path.join(directory, 'decisions.db')
    const statePath = path.join(directory, 'states.db')
    const escalationPath = path.join(directory, 'escalations.db')
    try {
      const decisions = new AxisPivotDecisionRegistry(decisionPath, {
        clock: sequenceClock(),
      })
      const states = new AxisRunStateRegistry(statePath, {
        clock: sequenceClock(),
      })
      const escalations = new AxisHumanEscalationRegistry(escalationPath, {
        clock: sequenceClock(),
        idFactory: () => 'escalation-persisted',
      })
      let state = states.create(
        axisShadowResult('run-escalate-persisted', 'session-1'),
        { ...axisBudget(), maxPivots: 3 },
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
      const decisionId = 'pivot-escalate-persisted'
      await new AxisPivotCoordinator({
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
      const request = {
        decisionId,
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
      }
      const first = new AxisPivotEscalateActionHandler({
        decisions: decisions.openActionReaderPort(),
        escalations: escalations.openEscalationPort(),
        states: states.openPivotActionReaderPort(),
      }).execute(request)
      expect(first.outcome).toBe('opened')
      escalations.close()
      decisions.close()
      states.close()

      const reopenedEscalations = new AxisHumanEscalationRegistry(escalationPath)
      const reopenedDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const reopenedStates = new AxisRunStateRegistry(statePath)
      const repeated = new AxisPivotEscalateActionHandler({
        decisions: reopenedDecisions.openActionReaderPort(),
        escalations: reopenedEscalations.openEscalationPort(),
        states: reopenedStates.openPivotActionReaderPort(),
      }).execute(request)

      expect(repeated).toEqual({ ...first, outcome: 'already-open' })
      expect(reopenedStates.get(state.runId)).toEqual(state)
      reopenedEscalations.close()
      reopenedDecisions.close()
      reopenedStates.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-30T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
