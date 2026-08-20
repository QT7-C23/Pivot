import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisPivotContinuationRegistry } from '../../src/main/services/axis-pivot-continuation-registry'
import { AxisPivotFailureEvidenceRegistry } from '../../src/main/services/axis-pivot-failure-evidence-registry'

describe('Axis Pivot failure registries', () => {
  it('durably reopens immutable failure evidence and continuation handoffs', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-failure-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const evidence = new AxisPivotFailureEvidenceRegistry(databasePath)
      const continuations = new AxisPivotContinuationRegistry(databasePath)
      expect(evidence.save(failureEvidence())).toEqual(failureEvidence())
      expect(continuations.save(handoff())).toEqual(handoff())
      expect(evidence.save(failureEvidence())).toEqual(failureEvidence())
      expect(continuations.save(handoff())).toEqual(handoff())
      evidence.close()
      continuations.close()

      const reopenedEvidence = new AxisPivotFailureEvidenceRegistry(databasePath)
      const reopenedContinuations = new AxisPivotContinuationRegistry(databasePath)
      expect(reopenedEvidence.findBySource('run-1', 4)).toEqual(failureEvidence())
      expect(reopenedContinuations.findByDecision('decision-1')).toEqual(handoff())
      reopenedEvidence.deleteForSession('session-1')
      reopenedContinuations.deleteForSession('session-1')
      expect(reopenedEvidence.findBySource('run-1', 4)).toBeNull()
      expect(reopenedContinuations.findByDecision('decision-1')).toBeNull()
      reopenedEvidence.close()
      reopenedContinuations.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('rejects conflicting or malformed durable values instead of replacing them', () => {
    const evidence = new AxisPivotFailureEvidenceRegistry()
    const continuations = new AxisPivotContinuationRegistry()
    evidence.save(failureEvidence())
    continuations.save(handoff())

    expect(() => evidence.save({
      ...failureEvidence(),
      summary: 'Different failure',
    })).toThrow(/conflict/i)
    expect(() => continuations.save({
      ...handoff(),
      targetRunId: 'run-2',
    })).toThrow(/conflict/i)
    expect(() => evidence.save({
      ...failureEvidence(),
      extra: true,
    } as never)).toThrow()

    evidence.close()
    continuations.close()
  })
})

function failureEvidence() {
  return {
    category: 'minor' as const,
    evidenceId: 'pivot-failure-1',
    observedAt: '2026-07-30T00:00:00.003Z',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    sourceEventRevision: 4,
    sourceEventTimestamp: '2026-07-30T00:00:00.003Z',
    summary: 'Worker failed',
    taskId: 'inspect',
  }
}

function handoff() {
  return {
    action: 'retry' as const,
    createdAt: '2026-07-30T00:00:00.005Z',
    decisionId: 'decision-1',
    executionRevision: 5,
    failureEvidenceId: 'pivot-failure-1',
    handoffId: 'continuation-1',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    status: 'pending-guarded-review' as const,
    targetRunId: 'run-1',
  }
}
