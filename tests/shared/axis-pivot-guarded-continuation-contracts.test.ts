import { describe, expect, it } from 'vitest'
import {
  AxisPivotGuardedContinuationAttemptSchema,
  AxisPivotGuardedContinuationRequestSchema,
} from '../../src/shared/axis-pivot-guarded-continuation-contracts'
import { guardedContinuationRequest } from '../fixtures/axis-pivot-guarded-continuation'

describe('Axis Pivot guarded continuation contracts', () => {
  it('accepts only an explicit handoff binding and the existing reviewed submission', () => {
    expect(AxisPivotGuardedContinuationRequestSchema.parse(
      guardedContinuationRequest(),
    )).toEqual(guardedContinuationRequest())

    expect(() => AxisPivotGuardedContinuationRequestSchema.parse({
      ...guardedContinuationRequest(),
      projectRoot: 'C:\\forged',
    })).toThrow()
    expect(() => AxisPivotGuardedContinuationRequestSchema.parse({
      ...guardedContinuationRequest(),
      submission: {
        ...guardedContinuationRequest().submission,
        authority: 'forged',
      },
    })).toThrow()
  })

  it('strictly separates submitting, completed, failed, and recovery-required evidence', () => {
    const attempt = submittingAttempt()
    expect(AxisPivotGuardedContinuationAttemptSchema.parse(attempt)).toEqual(
      attempt,
    )
    expect(() => AxisPivotGuardedContinuationAttemptSchema.parse({
      ...attempt,
      status: 'completed',
    })).toThrow()
    expect(AxisPivotGuardedContinuationAttemptSchema.parse({
      ...attempt,
      action: 'self-repair',
    }).action).toBe('self-repair')
    expect(AxisPivotGuardedContinuationAttemptSchema.parse({
      ...attempt,
      action: 'dedicated-fixer',
    }).action).toBe('dedicated-fixer')
    expect(() => AxisPivotGuardedContinuationAttemptSchema.parse({
      ...attempt,
      error: 'forged failure',
    })).toThrow()
    expect(() => AxisPivotGuardedContinuationAttemptSchema.parse({
      ...attempt,
      writes: guardedContinuationRequest().submission.writes,
    })).toThrow()
  })
})

function submittingAttempt() {
  return {
    action: 'retry' as const,
    attemptId: 'continuation-attempt-1',
    createdAt: '2026-07-30T00:00:01.000Z',
    decisionId: 'decision-1',
    error: null,
    guardedResult: null,
    handoffId: 'continuation-1',
    proposalId: 'proposal-1',
    requestSha256: '1'.repeat(64),
    reviewedProposalReceiptId: 'reviewed-proposal-1',
    revision: 1,
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    sourceRunId: 'run-1',
    status: 'submitting' as const,
    submittedTaskId: 'task-1',
    targetRunId: 'run-1',
    updatedAt: '2026-07-30T00:00:01.000Z',
  }
}
