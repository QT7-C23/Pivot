import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisDedicatedFixerAssignmentRegistry } from '../../src/main/services/axis-dedicated-fixer-assignment-registry'
import type { AxisWorkerAttemptBinding } from '../../src/shared/axis-worker-attempt-contracts'

describe('Axis dedicated Fixer assignment registry', () => {
  it('persists one decision assignment through a frozen narrow Port', () => {
    const registry = createRegistry(failedAttempt())
    const port = registry.openAssignmentPort()

    const assignment = port.assign(assignmentInput())

    expect(Object.isFrozen(port)).toBe(true)
    expect(port.findByDecision('pivot-security-1')).toEqual(assignment)
    expect(() => port.assign(assignmentInput())).toThrow(
      /decision|assigned|unique/i,
    )
    registry.close()
  })

  it('rejects running, mismatched, or same-Worker source evidence', () => {
    const running = {
      ...failedAttempt(),
      error: null,
      finishedAt: null,
      revision: 1,
      status: 'running' as const,
    }
    const runningRegistry = createRegistry(running)
    expect(() => runningRegistry.openAssignmentPort().assign(
      assignmentInput(),
    )).toThrow(/failed/i)
    runningRegistry.close()

    const mismatchRegistry = createRegistry(failedAttempt())
    expect(() => mismatchRegistry.openAssignmentPort().assign({
      ...assignmentInput(),
      sourceAttemptId: 'attempt-other',
    })).toThrow(/ownership|source/i)
    expect(() => mismatchRegistry.openAssignmentPort().assign({
      ...assignmentInput(),
      fixer: { ...securityFixer(), fixerId: 'worker-1' },
    })).toThrow(/different|source worker/i)
    mismatchRegistry.close()
  })

  it('rejects malformed source attempt Port output before persistence', () => {
    const registry = createRegistry({
      ...failedAttempt(),
      databaseHandle: 'forged',
    } as AxisWorkerAttemptBinding)

    expect(() => registry.openAssignmentPort().assign(
      assignmentInput(),
    )).toThrow()
    expect(registry.openAssignmentPort().findByDecision(
      'pivot-security-1',
    )).toBeNull()
    registry.close()
  })

  it('recovers the immutable assignment after database reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-fixer-'))
    const databasePath = path.join(directory, 'fixer.db')
    try {
      const first = createRegistry(failedAttempt(), databasePath)
      const assignment = first.openAssignmentPort().assign(assignmentInput())
      first.close()

      const reopened = createRegistry(failedAttempt(), databasePath)
      expect(reopened.openAssignmentPort().findByDecision(
        'pivot-security-1',
      )).toEqual(assignment)
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function createRegistry(
  attempt: AxisWorkerAttemptBinding,
  databasePath = ':memory:',
) {
  let id = 0
  return new AxisDedicatedFixerAssignmentRegistry(databasePath, {
    attempts: { findLatest: () => attempt },
    clock: () => new Date('2026-07-29T00:00:02.000Z'),
    idFactory: () => `fixer-assignment-${++id}`,
  })
}

function failedAttempt() {
  return {
    attempt: 1,
    attemptId: 'attempt-1',
    error: 'Security review failed',
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

function securityFixer() {
  return {
    fixerId: 'security-fixer',
    role: 'security-fixer' as const,
    schemaVersion: 1 as const,
    specialty: 'security' as const,
  }
}

function assignmentInput() {
  return {
    decisionId: 'pivot-security-1',
    executionRevision: 5,
    fixer: securityFixer(),
    issue: 'Repair the security finding',
    runId: 'run-1',
    sessionId: 'session-1',
    sourceAttempt: 1,
    sourceAttemptId: 'attempt-1',
    sourceWorkerId: 'worker-1',
    taskId: 'inspect',
  }
}
