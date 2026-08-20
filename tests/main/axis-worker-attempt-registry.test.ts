import { describe, expect, it } from 'vitest'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'

describe('Axis Worker attempt registry', () => {
  it('begins and finishes one attempt through separate frozen Ports', () => {
    const registry = createRegistry()
    const lifecycle = registry.openLifecyclePort()
    const reader = registry.openReaderPort()

    const running = lifecycle.begin(beginInput())
    const failed = lifecycle.finish({
      attemptId: running.attemptId,
      error: 'Worker omitted validation',
      expectedRevision: running.revision,
      runId: running.runId,
      sessionId: running.sessionId,
      status: 'failed',
      taskId: running.taskId,
      workerId: running.workerId,
    })

    expect(Object.isFrozen(lifecycle)).toBe(true)
    expect(Object.isFrozen(reader)).toBe(true)
    expect(failed).toMatchObject({
      attempt: 1,
      revision: 2,
      status: 'failed',
      workerId: 'worker-1',
    })
    expect(reader.findLatest({
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'inspect',
    })).toEqual(failed)
    registry.close()
  })

  it('rejects duplicate attempt numbers, stale revisions, and cross-owner finishes', () => {
    const registry = createRegistry()
    const lifecycle = registry.openLifecyclePort()
    const running = lifecycle.begin(beginInput())

    expect(() => lifecycle.begin(beginInput())).toThrow(/attempt|unique|recorded/i)
    expect(() => lifecycle.finish({
      attemptId: running.attemptId,
      error: 'failed',
      expectedRevision: running.revision + 1,
      runId: running.runId,
      sessionId: running.sessionId,
      status: 'failed',
      taskId: running.taskId,
      workerId: running.workerId,
    })).toThrow(/revision/i)
    expect(() => lifecycle.finish({
      attemptId: running.attemptId,
      error: 'failed',
      expectedRevision: running.revision,
      runId: running.runId,
      sessionId: 'session-other',
      status: 'failed',
      taskId: running.taskId,
      workerId: running.workerId,
    })).toThrow(/ownership|not found/i)
    registry.close()
  })

  it('creates one decision-bound assignment and reuses it without changing identity', () => {
    const registry = createRegistry()
    const lifecycle = registry.openLifecyclePort()
    const assignments = registry.openAssignmentPort()
    const running = lifecycle.begin(beginInput())
    const failed = lifecycle.finish({
      attemptId: running.attemptId,
      error: 'Worker omitted validation',
      expectedRevision: running.revision,
      runId: running.runId,
      sessionId: running.sessionId,
      status: 'failed',
      taskId: running.taskId,
      workerId: running.workerId,
    })
    const input = {
      decisionId: 'pivot-1',
      executionRevision: 5,
      issue: 'Repair the omitted validation',
      runId: failed.runId,
      sessionId: failed.sessionId,
      sourceAttempt: failed.attempt,
      sourceAttemptId: failed.attemptId,
      taskId: failed.taskId,
      workerId: failed.workerId,
    }

    const assignment = assignments.assign(input)

    expect(Object.isFrozen(assignments)).toBe(true)
    expect(assignments.findByDecision('pivot-1')).toEqual(assignment)
    expect(() => assignments.assign(input)).toThrow(/decision|assigned|unique/i)
    expect(assignment.workerId).toBe(failed.workerId)
    registry.close()
  })

  it('rejects assignment for a running or mismatched source attempt', () => {
    const registry = createRegistry()
    const lifecycle = registry.openLifecyclePort()
    const assignments = registry.openAssignmentPort()
    const running = lifecycle.begin(beginInput())
    const input = {
      decisionId: 'pivot-1',
      executionRevision: 5,
      issue: 'Repair',
      runId: running.runId,
      sessionId: running.sessionId,
      sourceAttempt: running.attempt,
      sourceAttemptId: running.attemptId,
      taskId: running.taskId,
      workerId: running.workerId,
    }

    expect(() => assignments.assign(input)).toThrow(/failed/i)
    expect(() => assignments.assign({
      ...input,
      workerId: 'worker-other',
    })).toThrow(/ownership|worker/i)
    registry.close()
  })
})

function createRegistry() {
  let id = 0
  let time = 0
  return new AxisWorkerAttemptRegistry(':memory:', {
    clock: () => new Date(`2026-07-29T00:00:00.${String(time++).padStart(3, '0')}Z`),
    idFactory: (kind) => `${kind}-${++id}`,
  })
}

function beginInput() {
  return {
    attempt: 1,
    runId: 'run-1',
    sessionId: 'session-1',
    taskId: 'inspect',
    workerId: 'worker-1',
  }
}
