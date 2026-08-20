import { describe, expect, it } from 'vitest'
import {
  AxisPivotContinuationHandoffSchema,
  AxisPivotFailureEvidenceSchema,
  AxisPivotFailureObservationSchema,
} from '../../src/shared/axis-pivot-failure-contracts'

describe('Axis Pivot failure contracts', () => {
  it('strictly validates an authoritative task-failure observation and evidence', () => {
    expect(AxisPivotFailureObservationSchema.parse({
      expectedRevision: 4,
      runId: 'run-1',
      sessionId: 'session-1',
    })).toEqual({
      expectedRevision: 4,
      runId: 'run-1',
      sessionId: 'session-1',
    })

    expect(AxisPivotFailureEvidenceSchema.parse(failureEvidence())).toEqual(
      failureEvidence(),
    )
    expect(() => AxisPivotFailureEvidenceSchema.parse({
      ...failureEvidence(),
      category: 'security',
    })).toThrow()
    expect(AxisPivotFailureEvidenceSchema.parse(directionFailureEvidence()))
      .toEqual(directionFailureEvidence())
    expect(() => AxisPivotFailureEvidenceSchema.parse({
      ...directionFailureEvidence(),
      category: 'minor',
    })).toThrow()
    expect(() => AxisPivotFailureEvidenceSchema.parse({
      ...directionFailureEvidence(),
      retryDecisionId: undefined,
    })).toThrow()
    expect(() => AxisPivotFailureObservationSchema.parse({
      expectedRevision: 4,
      runId: 'run-1',
      sessionId: 'session-1',
      action: 'retry',
    })).toThrow()
  })

  it('keeps continuation handoff pending review without accepting writes or authority', () => {
    expect(AxisPivotContinuationHandoffSchema.parse(handoff())).toEqual(
      handoff(),
    )
    expect(() => AxisPivotContinuationHandoffSchema.parse({
      ...handoff(),
      writes: [{ content: 'forged', filePath: 'src/app.ts' }],
    })).toThrow()
    expect(() => AxisPivotContinuationHandoffSchema.parse({
      ...handoff(),
      action: 'stop',
    })).toThrow()
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

function directionFailureEvidence() {
  return {
    category: 'direction' as const,
    evidenceId: 'pivot-failure-2',
    observedAt: '2026-08-02T01:00:00.008Z',
    retryDecisionId: 'decision-retry-1',
    runId: 'run-1',
    schemaVersion: 2 as const,
    sessionId: 'session-1',
    source: 'post-retry-task-failure' as const,
    sourceEventRevision: 8,
    sourceEventTimestamp: '2026-08-02T01:00:00.008Z',
    summary: 'Guarded retry failed its Gate',
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
