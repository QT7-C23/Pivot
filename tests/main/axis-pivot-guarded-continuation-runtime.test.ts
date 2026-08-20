import { access, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisPivotContinuationAttemptRegistry } from '../../src/main/services/axis-pivot-continuation-attempt-registry'
import { createAxisPivotGuardedContinuationRuntime } from '../../src/main/services/axis-pivot-guarded-continuation-runtime'
import { retryAuthorization } from '../fixtures/axis-pivot-guarded-continuation'

describe('Axis Pivot guarded continuation runtime', () => {
  it('constructs no durable resource unless both narrow Ports are available', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-continuation-off-'))
    const databasePath = path.join(directory, 'pivot.db')
    const authorization = { find: () => retryAuthorization() }
    const submissions = { submit: vi.fn() }
    try {
      expect(createAxisPivotGuardedContinuationRuntime({
        authorization: null,
        databasePath,
        submissions,
      })).toBeNull()
      expect(createAxisPivotGuardedContinuationRuntime({
        authorization,
        databasePath,
        submissions: null,
      })).toBeNull()
      await expect(access(databasePath)).rejects.toThrow()
      expect(submissions.submit).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('recovers an interrupted durable attempt before accepting work', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-continuation-ready-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = new AxisPivotContinuationAttemptRegistry(databasePath, {
        idFactory: () => 'attempt-1',
      })
      registry.begin(beginInput())
      registry.close()

      const submissions = { submit: vi.fn() }
      const runtime = createAxisPivotGuardedContinuationRuntime({
        authorization: { find: () => retryAuthorization() },
        databasePath,
        submissions,
      })
      if (!runtime) throw new Error('Expected guarded continuation runtime')
      await runtime.ready

      expect(runtime.findAttempts('continuation-1')).toEqual([
        expect.objectContaining({
          error: 'Guarded continuation submission was interrupted; manual reconciliation is required',
          status: 'recovery-required',
        }),
      ])
      expect(submissions.submit).not.toHaveBeenCalled()
      runtime.deleteForSession('session-1')
      expect(runtime.findAttempts('continuation-1')).toEqual([])
      runtime.close()
      runtime.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
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
