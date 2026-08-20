import { describe, expect, it } from 'vitest'
import {
  AxisPivotRetryActionRequestSchema,
  AxisPivotRetryActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis Pivot retry action contracts', () => {
  it('accepts a Main-owned task retry receipt bound to one decision revision', () => {
    expect(AxisPivotRetryActionResultSchema.parse(validResult())).toMatchObject({
      action: 'retry',
      authority: 'pivot-main',
      executionRevision: 5,
      outcome: 'scheduled',
      stateRevision: 6,
      taskId: 'inspect',
    })
  })

  it('rejects caller-selected task/authority and mismatched retry evidence', () => {
    expect(() => AxisPivotRetryActionRequestSchema.parse({
      decisionId: 'pivot-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'forged-task',
    })).toThrow()
    expect(() => AxisPivotRetryActionRequestSchema.parse({
      action: 'retry',
      decisionId: 'pivot-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
    })).toThrow()
    expect(() => AxisPivotRetryActionResultSchema.parse({
      ...validResult(),
      event: { ...validResult().event, pivotDecisionId: 'pivot-other' },
    })).toThrow(/decision/i)
    expect(() => AxisPivotRetryActionResultSchema.parse({
      ...validResult(),
      stateRevision: 7,
    })).toThrow(/revision/i)
  })
})

function validResult() {
  return {
    action: 'retry' as const,
    authority: 'pivot-main' as const,
    decisionId: 'pivot-1',
    event: {
      detail: 'Retry scheduled by Dynamic Pivot',
      pivotDecisionId: 'pivot-1',
      revision: 6,
      taskId: 'inspect',
      timestamp: '2026-07-29T00:00:01.000Z',
      type: 'pivot-retry-scheduled' as const,
    },
    executionRevision: 5,
    outcome: 'scheduled' as const,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    stateRevision: 6,
    taskId: 'inspect',
  }
}
