import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisPivotActionDispatcher } from '../../src/main/services/axis-pivot-action-dispatcher'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotStopActionHandler } from '../../src/main/services/axis-pivot-stop-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot stop action Main persistence', () => {
  it('persists one terminal transition and reuses it after database reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-stop-action-'))
    const decisionPath = path.join(directory, 'decisions.db')
    const statePath = path.join(directory, 'states.db')
    try {
      const decisions = new AxisPivotDecisionRegistry(decisionPath, {
        clock: sequenceClock(),
      })
      const states = new AxisRunStateRegistry(statePath, {
        clock: sequenceClock(),
      })
      let state = states.create(
        axisShadowResult('run-stop-persisted', 'session-1'),
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
          summary: 'Worker failed',
          taskId: 'inspect',
          usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
        },
        runId: state.runId,
        sessionId: state.sessionId,
      })
      const decisionId = 'pivot-stop-persisted'
      await new AxisPivotCoordinator({
        decisions,
        idFactory: () => decisionId,
        model: {
          decidePivot: vi.fn(async () => ({
            output: {
              action: 'stop',
              reason: 'Stop after the failed direction',
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
      const stopHandler = new AxisPivotStopActionHandler({
        decisions: reopenedDecisions.openActionReaderPort(),
        states: reopenedStates.openPivotStopStatePort(),
      })
      const stoppedDispatch = await dispatcherFor(
        reopenedDecisions.openActionReaderPort(),
        stopHandler,
      ).dispatch(request)
      expect(stoppedDispatch.route).toBe('terminal')
      expect(stoppedDispatch.result.outcome).toBe('stopped')
      expect(Object.isFrozen(
        reopenedStates.openPivotStopStatePort(),
      )).toBe(true)
      reopenedDecisions.close()
      reopenedStates.close()

      const finalDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const finalStates = new AxisRunStateRegistry(statePath)
      const repeatedStopHandler = new AxisPivotStopActionHandler({
        decisions: finalDecisions.openActionReaderPort(),
        states: finalStates.openPivotStopStatePort(),
      })
      const repeatedDispatch = await dispatcherFor(
        finalDecisions.openActionReaderPort(),
        repeatedStopHandler,
      ).dispatch(request)

      expect(repeatedDispatch).toEqual({
        ...stoppedDispatch,
        result: {
          ...stoppedDispatch.result,
          outcome: 'already-stopped',
        },
      })
      expect(finalStates.get(state.runId)).toMatchObject({
        revision: state.revision + 1,
        status: 'stopped',
        tasks: [{ status: 'failed', taskId: 'inspect' }],
      })
      finalDecisions.close()
      finalStates.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function dispatcherFor(
  decisions: ReturnType<AxisPivotDecisionRegistry['openActionReaderPort']>,
  stop: AxisPivotStopActionHandler,
) {
  const unavailable = {
    execute: () => {
      throw new Error('Unexpected Pivot action route')
    },
  }
  return new AxisPivotActionDispatcher({
    decisions,
    executors: {
      'dedicated-fixer': unavailable,
      discard: unavailable,
      escalate: unavailable,
      replan: unavailable,
      retry: unavailable,
      'self-repair': unavailable,
      stop,
    },
  })
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(
    `2026-07-30T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
