import { describe, expect, it } from 'vitest'
import {
  AxisPivotReviewedContinuationOrchestrationSchema,
  AxisPivotReviewedContinuationRequestSchema,
} from '../../src/shared/axis-pivot-reviewed-continuation-contracts'
import { reviewedProposalResult } from '../fixtures/axis-pivot-guarded-continuation'

describe('Axis Pivot reviewed continuation contracts', () => {
  it('accepts only a decision identifier and no caller-selected execution target', () => {
    expect(AxisPivotReviewedContinuationRequestSchema.parse({
      decisionId: 'decision-1',
    })).toEqual({ decisionId: 'decision-1' })
    expect(() => AxisPivotReviewedContinuationRequestSchema.parse({
      decisionId: 'decision-1',
      taskId: 'forged-task',
    })).toThrow()
    expect(() => AxisPivotReviewedContinuationRequestSchema.parse({
      decisionId: 'decision-1',
      writes: [{ content: 'forged', filePath: 'src/one.ts' }],
    })).toThrow()
  })

  it('strictly separates preparing, submitting, completed and failed evidence', () => {
    const preparing = preparingOrchestration()
    expect(AxisPivotReviewedContinuationOrchestrationSchema.parse(preparing))
      .toEqual(preparing)
    expect(() => AxisPivotReviewedContinuationOrchestrationSchema.parse({
      ...preparing,
      action: 'replan',
    })).toThrow()
    expect(() => AxisPivotReviewedContinuationOrchestrationSchema.parse({
      ...preparing,
      proposalResult: reviewedProposalResult(),
    })).toThrow()
    expect(() => AxisPivotReviewedContinuationOrchestrationSchema.parse({
      ...preparing,
      status: 'completed',
    })).toThrow()
  })
})

function preparingOrchestration() {
  return {
    action: 'retry' as const,
    continuationAttempt: null,
    createdAt: '2026-08-02T00:00:00.000Z',
    decisionId: 'decision-1',
    error: null,
    handoffId: 'continuation-1',
    orchestrationId: 'reviewed-continuation-1',
    proposalResult: null,
    revision: 1,
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    sourceRunId: 'run-1',
    status: 'preparing' as const,
    submittedTaskId: 'task-1',
    targetRunId: 'run-1',
    updatedAt: '2026-08-02T00:00:00.000Z',
  }
}
