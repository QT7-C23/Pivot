import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisPivotContinuationAttemptRegistry } from '../../src/main/services/axis-pivot-continuation-attempt-registry'

describe('AxisPivotContinuationAttemptRegistry', () => {
  it('durably fails closed instead of replaying an interrupted submission', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-continuation-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = new AxisPivotContinuationAttemptRegistry(databasePath, {
        clock: () => new Date('2026-07-30T00:00:01.000Z'),
        idFactory: () => 'attempt-1',
      })
      registry.begin(beginInput())
      registry.close()

      const reopened = new AxisPivotContinuationAttemptRegistry(databasePath, {
        clock: () => new Date('2026-07-30T00:00:02.000Z'),
      })
      expect(reopened.recoverInterrupted()).toEqual([
        expect.objectContaining({
          error: 'Guarded continuation submission was interrupted; manual reconciliation is required',
          revision: 2,
          status: 'recovery-required',
        }),
      ])
      expect(reopened.findByRequest('continuation-1', '1'.repeat(64)))
        .toMatchObject({ status: 'recovery-required' })
      expect(reopened.recoverInterrupted()).toEqual([])
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('uses optimistic terminal transitions and keeps the request unique', () => {
    const registry = new AxisPivotContinuationAttemptRegistry(':memory:', {
      clock: () => new Date('2026-07-30T00:00:01.000Z'),
      idFactory: () => 'attempt-1',
    })
    const first = registry.begin(beginInput())
    expect(first.created).toBe(true)
    const attempt = first.attempt
    expect(registry.begin(beginInput())).toEqual({
      attempt,
      created: false,
    })
    expect(registry.fail({
      attemptId: attempt.attemptId,
      error: 'review baseline changed',
      expectedRevision: attempt.revision,
    })).toMatchObject({ revision: 2, status: 'failed' })
    expect(() => registry.fail({
      attemptId: attempt.attemptId,
      error: 'again',
      expectedRevision: attempt.revision,
    })).toThrow(/revision|status/i)
    registry.close()
  })
})

function beginInput() {
  return {
    action: 'retry' as const,
    decisionId: 'decision-1',
    handoffId: 'continuation-1',
    proposalId: 'proposal-1',
    requestSha256: '1'.repeat(64),
    reviewedProposalReceiptId: 'reviewed-proposal-1',
    sessionId: 'session-1',
    sourceRunId: 'run-1',
    submittedTaskId: 'task-1',
    targetRunId: 'run-1',
  }
}
