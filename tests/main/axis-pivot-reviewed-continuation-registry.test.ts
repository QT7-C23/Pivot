import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisPivotReviewedContinuationRegistry } from '../../src/main/services/axis-pivot-reviewed-continuation-registry'
import { reviewedProposalResult } from '../fixtures/axis-pivot-guarded-continuation'

describe('AxisPivotReviewedContinuationRegistry', () => {
  it('persists creator ownership and recovers interrupted proposal/submission work without replay', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-reviewed-continuation-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = new AxisPivotReviewedContinuationRegistry(databasePath, {
        clock: () => new Date('2026-08-02T00:00:00.000Z'),
        idFactory: () => 'reviewed-continuation-1',
      })
      const first = registry.begin(beginInput())
      expect(first).toMatchObject({ created: true, orchestration: { status: 'preparing' } })
      expect(registry.begin(beginInput())).toEqual({
        created: false,
        orchestration: first.orchestration,
      })
      registry.markSubmitting({
        expectedRevision: first.orchestration.revision,
        orchestrationId: first.orchestration.orchestrationId,
        proposalResult: reviewedProposalResult(),
      })
      registry.close()

      const reopened = new AxisPivotReviewedContinuationRegistry(databasePath, {
        clock: () => new Date('2026-08-02T00:00:01.000Z'),
      })
      expect(reopened.recoverInterrupted()).toEqual([
        expect.objectContaining({
          error: expect.stringMatching(/manual reconciliation/i),
          proposalResult: reviewedProposalResult(),
          revision: 3,
          status: 'recovery-required',
        }),
      ])
      expect(reopened.recoverInterrupted()).toEqual([])
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('uses optimistic transitions and rejects conflicting decision ownership', () => {
    const registry = new AxisPivotReviewedContinuationRegistry(':memory:', {
      clock: () => new Date('2026-08-02T00:00:00.000Z'),
      idFactory: () => 'reviewed-continuation-1',
    })
    const begun = registry.begin(beginInput())
    expect(() => registry.begin({
      ...beginInput(),
      submittedTaskId: 'other-task',
    })).toThrow(/ownership/i)
    const failed = registry.fail({
      error: 'proposal baseline changed',
      expectedRevision: begun.orchestration.revision,
      orchestrationId: begun.orchestration.orchestrationId,
    })
    expect(failed).toMatchObject({ revision: 2, status: 'failed' })
    expect(() => registry.fail({
      error: 'again',
      expectedRevision: begun.orchestration.revision,
      orchestrationId: begun.orchestration.orchestrationId,
    })).toThrow(/revision|status/i)
    registry.close()
  })
})

function beginInput() {
  return {
    action: 'retry' as const,
    decisionId: 'decision-1',
    handoffId: 'continuation-1',
    sessionId: 'session-1',
    sourceRunId: 'run-1',
    submittedTaskId: 'task-1',
    targetRunId: 'run-1',
  }
}
