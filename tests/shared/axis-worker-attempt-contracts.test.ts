import { describe, expect, it } from 'vitest'
import {
  AxisSelfRepairAssignmentSchema,
  AxisWorkerAttemptBindingSchema,
} from '../../src/shared/axis-worker-attempt-contracts'

describe('Axis Worker attempt contracts', () => {
  it('accepts a terminal failed attempt and an immutable same-Worker assignment', () => {
    const attempt = AxisWorkerAttemptBindingSchema.parse(failedAttempt())
    const assignment = AxisSelfRepairAssignmentSchema.parse({
      assignmentId: 'assignment-1',
      createdAt: '2026-07-29T00:00:02.000Z',
      decisionId: 'pivot-1',
      executionRevision: 5,
      issue: 'Repair the omitted validation',
      runId: attempt.runId,
      schemaVersion: 1,
      sessionId: attempt.sessionId,
      sourceAttempt: attempt.attempt,
      sourceAttemptId: attempt.attemptId,
      status: 'assigned',
      taskId: attempt.taskId,
      workerId: attempt.workerId,
    })

    expect(assignment).toMatchObject({
      sourceAttemptId: attempt.attemptId,
      workerId: attempt.workerId,
    })
  })

  it('rejects unknown fields and malformed ownership identifiers', () => {
    expect(() => AxisWorkerAttemptBindingSchema.parse({
      ...failedAttempt(),
      databaseHandle: 'forbidden',
    })).toThrow()
    expect(() => AxisSelfRepairAssignmentSchema.parse({
      assignmentId: 'assignment-1',
      createdAt: '2026-07-29T00:00:02.000Z',
      decisionId: 'pivot-1',
      executionRevision: 5,
      issue: 'Repair',
      runId: ' ',
      schemaVersion: 1,
      sessionId: 'session-1',
      sourceAttempt: 1,
      sourceAttemptId: 'attempt-1',
      status: 'assigned',
      taskId: 'inspect',
      workerId: 'worker-1',
    })).toThrow()
  })

  it('requires running and terminal timestamps to agree with status', () => {
    expect(() => AxisWorkerAttemptBindingSchema.parse({
      ...failedAttempt(),
      error: null,
    })).toThrow(/failed/i)
    expect(() => AxisWorkerAttemptBindingSchema.parse({
      ...failedAttempt(),
      error: null,
      finishedAt: null,
      status: 'running',
    })).toThrow()
    expect(() => AxisWorkerAttemptBindingSchema.parse({
      ...failedAttempt(),
      error: 'must be absent',
      status: 'completed',
    })).toThrow(/completed/i)
  })
})

function failedAttempt() {
  return {
    attempt: 1,
    attemptId: 'attempt-1',
    error: 'Worker omitted validation',
    finishedAt: '2026-07-29T00:00:01.000Z',
    revision: 2,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    startedAt: '2026-07-29T00:00:00.000Z',
    status: 'failed' as const,
    taskId: 'inspect',
    updatedAt: '2026-07-29T00:00:01.000Z',
    workerId: 'worker-1',
  }
}
