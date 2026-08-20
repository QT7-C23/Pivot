import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisWorkerDiscardRegistry } from '../../src/main/services/axis-worker-discard-registry'
import type {
  AxisWorkerAttemptBinding,
} from '../../src/shared/axis-worker-attempt-contracts'

describe('Axis Worker discard registry', () => {
  it('persists one decision disposition through a frozen narrow Port', () => {
    const registry = createRegistry(failedAttempt())
    const port = registry.openDiscardPort()

    const receipt = port.discard(discardInput())

    expect(Object.isFrozen(port)).toBe(true)
    expect(port.findByDecision('pivot-discard-1')).toEqual(receipt)
    expect(() => port.discard(discardInput())).toThrow(
      /decision|discard|unique/i,
    )
    registry.close()
  })

  it('rejects running or mismatched source-attempt evidence', () => {
    const runningRegistry = createRegistry({
      ...failedAttempt(),
      error: null,
      finishedAt: null,
      revision: 1,
      status: 'running',
    })
    expect(() => runningRegistry.openDiscardPort().discard(
      discardInput(),
    )).toThrow(/failed/i)
    runningRegistry.close()

    const mismatchRegistry = createRegistry(failedAttempt())
    expect(() => mismatchRegistry.openDiscardPort().discard({
      ...discardInput(),
      sourceAttemptId: 'attempt-other',
    })).toThrow(/ownership|source/i)
    mismatchRegistry.close()
  })

  it('rejects malformed attempt Port output before persistence', () => {
    const registry = createRegistry({
      ...failedAttempt(),
      databaseHandle: 'forged',
    } as AxisWorkerAttemptBinding)

    expect(() => registry.openDiscardPort().discard(discardInput())).toThrow()
    expect(registry.openDiscardPort().findByDecision(
      'pivot-discard-1',
    )).toBeNull()
    registry.close()
  })

  it('recovers the immutable receipt after database reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-discard-'))
    const databasePath = path.join(directory, 'discard.db')
    try {
      const first = createRegistry(failedAttempt(), databasePath)
      const receipt = first.openDiscardPort().discard(discardInput())
      first.close()

      const reopened = createRegistry(failedAttempt(), databasePath)
      expect(reopened.openDiscardPort().findByDecision(
        'pivot-discard-1',
      )).toEqual(receipt)
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
  return new AxisWorkerDiscardRegistry(databasePath, {
    attempts: { findLatest: () => attempt },
    clock: () => new Date('2026-07-30T00:00:02.000Z'),
    idFactory: () => `discard-${++id}`,
  })
}

function failedAttempt(): AxisWorkerAttemptBinding {
  return {
    attempt: 1,
    attemptId: 'attempt-1',
    error: 'Excessive review failures',
    finishedAt: '2026-07-30T00:00:01.000Z',
    revision: 2,
    runId: 'run-1',
    schemaVersion: 1,
    sessionId: 'session-1',
    startedAt: '2026-07-30T00:00:00.000Z',
    status: 'failed',
    taskId: 'inspect',
    updatedAt: '2026-07-30T00:00:01.000Z',
    workerId: 'worker-1',
  }
}

function discardInput() {
  return {
    decisionId: 'pivot-discard-1',
    executionRevision: 5,
    reason: 'Discard the failed Worker attempt',
    runId: 'run-1',
    sessionId: 'session-1',
    sourceAttempt: 1,
    sourceAttemptId: 'attempt-1',
    sourceWorkerId: 'worker-1',
    taskId: 'inspect',
  }
}
