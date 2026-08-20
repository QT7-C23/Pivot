import { access, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createAxisPivotReviewedContinuationRuntime } from '../../src/main/services/axis-pivot-reviewed-continuation-runtime'
import { AxisPivotReviewedContinuationRegistry } from '../../src/main/services/axis-pivot-reviewed-continuation-registry'
import {
  retryAuthorization,
  reviewedProposalResult,
} from '../fixtures/axis-pivot-guarded-continuation'

describe('Axis Pivot reviewed continuation runtime', () => {
  it('constructs no durable resource unless all three narrow Ports are available', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-reviewed-off-'))
    const databasePath = path.join(directory, 'pivot.db')
    const authorization = { find: () => retryAuthorization() }
    const continuations = { consume: vi.fn() }
    const proposals = { propose: vi.fn() }
    try {
      expect(createAxisPivotReviewedContinuationRuntime({
        authorization: null,
        continuations,
        databasePath,
        proposals,
      })).toBeNull()
      expect(createAxisPivotReviewedContinuationRuntime({
        authorization,
        continuations: null,
        databasePath,
        proposals,
      })).toBeNull()
      expect(createAxisPivotReviewedContinuationRuntime({
        authorization,
        continuations,
        databasePath,
        proposals: null,
      })).toBeNull()
      await expect(access(databasePath)).rejects.toThrow()
      expect(continuations.consume).not.toHaveBeenCalled()
      expect(proposals.propose).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('recovers an interrupted prepared submission before accepting work without replay', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-reviewed-ready-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = new AxisPivotReviewedContinuationRegistry(databasePath, {
        idFactory: () => 'reviewed-continuation-1',
      })
      const begun = registry.begin(beginInput())
      registry.markSubmitting({
        expectedRevision: begun.orchestration.revision,
        orchestrationId: begun.orchestration.orchestrationId,
        proposalResult: reviewedProposalResult(),
      })
      registry.close()

      const continuations = { consume: vi.fn() }
      const proposals = { propose: vi.fn() }
      const runtime = createAxisPivotReviewedContinuationRuntime({
        authorization: { find: () => retryAuthorization() },
        continuations,
        databasePath,
        proposals,
      })
      if (!runtime) throw new Error('Expected reviewed continuation runtime')
      await runtime.ready

      expect(runtime.find('decision-1')).toMatchObject({
        error: expect.stringMatching(/manual reconciliation/i),
        proposalResult: reviewedProposalResult(),
        status: 'recovery-required',
      })
      await expect(runtime.orchestrate({ decisionId: 'decision-1' }))
        .rejects.toThrow(/manual reconciliation/i)
      expect(continuations.consume).not.toHaveBeenCalled()
      expect(proposals.propose).not.toHaveBeenCalled()
      runtime.deleteForSession('session-1')
      expect(runtime.find('decision-1')).toBeNull()
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
    sessionId: 'session-1',
    sourceRunId: 'run-1',
    submittedTaskId: 'task-1',
    targetRunId: 'run-1',
  }
}
