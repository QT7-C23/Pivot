import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotDiscardActionHandler } from '../../src/main/services/axis-pivot-discard-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import { AxisWorkerDiscardRegistry } from '../../src/main/services/axis-worker-discard-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot discard Main persistence', () => {
  it('reuses one Worker disposition after every Registry reopens', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-discard-action-'))
    const decisionPath = path.join(directory, 'decisions.db')
    const statePath = path.join(directory, 'states.db')
    const attemptPath = path.join(directory, 'attempts.db')
    const discardPath = path.join(directory, 'discards.db')
    try {
      const decisions = new AxisPivotDecisionRegistry(decisionPath, {
        clock: sequenceClock(),
      })
      const states = new AxisRunStateRegistry(statePath, {
        clock: sequenceClock(),
      })
      const attempts = new AxisWorkerAttemptRegistry(attemptPath, {
        clock: sequenceClock(),
        idFactory: (kind) => `${kind}-persisted`,
      })
      const discards = new AxisWorkerDiscardRegistry(discardPath, {
        attempts: attempts.openReaderPort(),
        clock: sequenceClock(),
        idFactory: () => 'discard-persisted',
      })
      const budget = {
        ...axisBudget(),
        maxPivots: 3,
        maxRetriesPerTask: 2,
      }
      let state = states.create(
        axisShadowResult('run-discard-persisted', 'session-1'),
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
      const running = attempts.openLifecyclePort().begin({
        attempt: 1,
        runId: state.runId,
        sessionId: state.sessionId,
        taskId: 'inspect',
        workerId: 'worker-persisted',
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
      attempts.openLifecyclePort().finish({
        attemptId: running.attemptId,
        error: 'Excessive review failures',
        expectedRevision: running.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        status: 'failed',
        taskId: 'inspect',
        workerId: 'worker-persisted',
      })
      const decisionId = 'pivot-discard-persisted'
      await new AxisPivotCoordinator({
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
      const request = {
        decisionId,
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
      }
      const first = new AxisPivotDiscardActionHandler({
        attempts: attempts.openReaderPort(),
        decisions: decisions.openActionReaderPort(),
        discards: discards.openDiscardPort(),
        states: states.openPivotActionReaderPort(),
      }).execute(request)
      expect(first.outcome).toBe('discarded')
      discards.close()
      attempts.close()
      decisions.close()
      states.close()

      const reopenedAttempts = new AxisWorkerAttemptRegistry(attemptPath)
      const reopenedDiscards = new AxisWorkerDiscardRegistry(discardPath, {
        attempts: reopenedAttempts.openReaderPort(),
      })
      const reopenedDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const reopenedStates = new AxisRunStateRegistry(statePath)
      const repeated = new AxisPivotDiscardActionHandler({
        attempts: reopenedAttempts.openReaderPort(),
        decisions: reopenedDecisions.openActionReaderPort(),
        discards: reopenedDiscards.openDiscardPort(),
        states: reopenedStates.openPivotActionReaderPort(),
      }).execute(request)

      expect(repeated).toEqual({ ...first, outcome: 'already-discarded' })
      expect(reopenedStates.get(state.runId)).toEqual(state)
      reopenedDiscards.close()
      reopenedAttempts.close()
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
