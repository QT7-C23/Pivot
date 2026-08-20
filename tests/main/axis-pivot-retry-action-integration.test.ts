import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotRetryActionHandler } from '../../src/main/services/axis-pivot-retry-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot retry action Main persistence', () => {
  it('preserves one scheduled retry across database reopen and reuses its evidence', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-retry-action-'))
    const decisionPath = path.join(directory, 'decisions.db')
    const statePath = path.join(directory, 'states.db')
    try {
      const decisions = new AxisPivotDecisionRegistry(decisionPath, { clock: sequenceClock() })
      const states = new AxisRunStateRegistry(statePath, { clock: sequenceClock() })
      const budget = { ...axisBudget(), maxPivots: 3, maxRetriesPerTask: 2 }
      let state = states.create(axisShadowResult('run-retry-persisted', 'session-1'), budget)
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
      const decisionId = 'pivot-retry-persisted'
      await new AxisPivotCoordinator({
        decisions,
        idFactory: () => decisionId,
        model: {
          decidePivot: vi.fn(async () => ({
            output: { action: 'retry', reason: 'Retry after failure', taskId: 'inspect' },
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
          evidenceIds: ['review-1'],
          summary: 'Execution direction failed',
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
      decisions.close()
      states.close()

      const reopenedDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const reopenedStates = new AxisRunStateRegistry(statePath)
      const firstHandler = new AxisPivotRetryActionHandler({
        decisions: reopenedDecisions.openActionReaderPort(),
        states: reopenedStates.openPivotRetryStatePort(),
      })
      const scheduled = firstHandler.execute(request)
      expect(scheduled.outcome).toBe('scheduled')
      expect(Object.isFrozen(reopenedStates.openPivotRetryStatePort())).toBe(true)
      reopenedDecisions.close()
      reopenedStates.close()

      const finalDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const finalStates = new AxisRunStateRegistry(statePath)
      const repeated = new AxisPivotRetryActionHandler({
        decisions: finalDecisions.openActionReaderPort(),
        states: finalStates.openPivotRetryStatePort(),
      }).execute(request)
      expect(repeated).toMatchObject({
        event: scheduled.event,
        outcome: 'already-scheduled',
        stateRevision: scheduled.stateRevision,
      })
      expect(finalStates.get(state.runId)).toMatchObject({
        revision: state.revision + 1,
        usage: { retriesForTask: 1 },
      })
      finalDecisions.close()
      finalStates.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(`2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`)
}
