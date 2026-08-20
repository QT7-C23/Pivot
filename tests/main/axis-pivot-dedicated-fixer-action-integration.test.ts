import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisDedicatedFixerAssignmentRegistry } from '../../src/main/services/axis-dedicated-fixer-assignment-registry'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisPivotDedicatedFixerActionHandler } from '../../src/main/services/axis-pivot-dedicated-fixer-action-handler'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisSecurityFixerResolverAdapter } from '../../src/main/services/axis-security-fixer-resolver-adapter'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot dedicated Fixer Main persistence', () => {
  it('reuses one different-Worker assignment after every Registry reopens', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-fixer-action-'))
    const decisionPath = path.join(directory, 'decisions.db')
    const statePath = path.join(directory, 'states.db')
    const attemptPath = path.join(directory, 'attempts.db')
    const assignmentPath = path.join(directory, 'fixer-assignments.db')
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
      const assignments = new AxisDedicatedFixerAssignmentRegistry(
        assignmentPath,
        {
          attempts: attempts.openReaderPort(),
          clock: sequenceClock(),
          idFactory: () => 'fixer-assignment-persisted',
        },
      )
      const budget = {
        ...axisBudget(),
        maxPivots: 3,
        maxRetriesPerTask: 2,
      }
      let state = states.create(
        axisShadowResult('run-security-persisted', 'session-1'),
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
          summary: 'Security review failed',
          taskId: 'inspect',
          usage: { costUsd: 0.01, durationMs: 10, tokens: 10 },
        },
        runId: state.runId,
        sessionId: state.sessionId,
      })
      attempts.openLifecyclePort().finish({
        attemptId: running.attemptId,
        error: 'Security review failed',
        expectedRevision: running.revision,
        runId: state.runId,
        sessionId: state.sessionId,
        status: 'failed',
        taskId: 'inspect',
        workerId: 'worker-persisted',
      })
      const decisionId = 'pivot-security-persisted'
      await new AxisPivotCoordinator({
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
      const request = {
        decisionId,
        expectedRevision: state.revision,
        runId: state.runId,
        sessionId: state.sessionId,
      }
      const first = new AxisPivotDedicatedFixerActionHandler({
        assignments: assignments.openAssignmentPort(),
        attempts: attempts.openReaderPort(),
        decisions: decisions.openActionReaderPort(),
        fixers: new AxisSecurityFixerResolverAdapter().openResolverPort(),
        states: states.openPivotAssignmentStatePort(),
      }).execute(request)
      expect(first.outcome).toBe('assigned')
      const scheduledState = states.get(state.runId)!
      assignments.close()
      attempts.close()
      decisions.close()
      states.close()

      const reopenedAttempts = new AxisWorkerAttemptRegistry(attemptPath)
      const reopenedAssignments = new AxisDedicatedFixerAssignmentRegistry(
        assignmentPath,
        { attempts: reopenedAttempts.openReaderPort() },
      )
      const reopenedDecisions = new AxisPivotDecisionRegistry(decisionPath)
      const reopenedStates = new AxisRunStateRegistry(statePath)
      const repeated = new AxisPivotDedicatedFixerActionHandler({
        assignments: reopenedAssignments.openAssignmentPort(),
        attempts: reopenedAttempts.openReaderPort(),
        decisions: reopenedDecisions.openActionReaderPort(),
        fixers: new AxisSecurityFixerResolverAdapter().openResolverPort(),
        states: reopenedStates.openPivotAssignmentStatePort(),
      }).execute(request)

      expect(repeated).toEqual({
        ...first,
        outcome: 'already-assigned',
        scheduleOutcome: 'already-scheduled',
      })
      expect(repeated.fixerId).not.toBe(repeated.assignment.sourceWorkerId)
      expect(reopenedStates.get(state.runId)).toEqual(scheduledState)
      reopenedAssignments.close()
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
