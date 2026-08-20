import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotSelfRepairActionHandler } from '../../src/main/services/axis-pivot-self-repair-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot self-repair assignment Main persistence', () => {
  it('reuses the same Worker assignment after all SQLite registries reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-self-repair-'))
    const decisionPath = path.join(directory, 'decisions.db')
    const statePath = path.join(directory, 'states.db')
    const attemptPath = path.join(directory, 'attempts.db')
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
      const budget = {
        ...axisBudget(),
        maxPivots: 3,
        maxRetriesPerTask: 2,
      }
      let state = states.create(
        axisShadowResult('run-self-repair-persisted', 'session-1'),
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
          summary: 'Worker omitted validation',
          taskId: 'inspect',
          usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
        },
        runId: state.runId,
        sessionId: state.sessionId,
      })
      attempts.openLifecyclePort().finish({
        attemptId: running.attemptId,
        error: 'Worker omitted validation',
        expectedRevision: running.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        status: 'failed',
        taskId: 'inspect',
        workerId: 'worker-persisted',
      })
      const decisionId = 'pivot-self-repair-persisted'
      await new AxisPivotCoordinator({
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
      const request = {
        decisionId,
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
      }
      const first = new AxisPivotSelfRepairActionHandler({
        assignments: attempts.openAssignmentPort(),
        attempts: attempts.openReaderPort(),
        decisions: decisions.openActionReaderPort(),
        states: states.openPivotAssignmentStatePort(),
      }).execute(request)
      expect(first.outcome).toBe('assigned')
      const scheduledState = states.get(state.runId)!
      attempts.close()
      decisions.close()
      states.close()

      const reopenedAttempts = new AxisWorkerAttemptRegistry(attemptPath)
      const reopenedDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const reopenedStates = new AxisRunStateRegistry(statePath)
      const repeated = new AxisPivotSelfRepairActionHandler({
        assignments: reopenedAttempts.openAssignmentPort(),
        attempts: reopenedAttempts.openReaderPort(),
        decisions: reopenedDecisions.openActionReaderPort(),
        states: reopenedStates.openPivotAssignmentStatePort(),
      }).execute(request)

      expect(repeated).toEqual({
        ...first,
        outcome: 'already-assigned',
        scheduleOutcome: 'already-scheduled',
      })
      expect(reopenedStates.get(state.runId)).toEqual(scheduledState)
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
    `2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`,
  )
}
