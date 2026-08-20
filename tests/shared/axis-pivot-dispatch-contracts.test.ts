import { describe, expect, it } from 'vitest'
import {
  AxisPivotDispatchRequestSchema,
  AxisPivotDispatchResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis Pivot dispatch contracts', () => {
  it('accepts only the four decision-bound request fields', () => {
    const request = {
      decisionId: 'decision-1',
      expectedRevision: 3,
      runId: 'run-1',
      sessionId: 'session-1',
    }

    expect(AxisPivotDispatchRequestSchema.parse(request)).toEqual(request)
    expect(() => AxisPivotDispatchRequestSchema.parse({
      ...request,
      action: 'retry',
    })).toThrow()
  })

  it('separates continuation from terminal result evidence', () => {
    const retry = retryDispatchResult()
    const stop = stopDispatchResult()

    expect(AxisPivotDispatchResultSchema.parse(retry).route).toBe('continuation')
    expect(AxisPivotDispatchResultSchema.parse(stop).route).toBe('terminal')
    expect(() => AxisPivotDispatchResultSchema.parse({
      ...stop,
      route: 'continuation',
    })).toThrow()
  })

  it('rejects nested action evidence with mismatched ownership or revision', () => {
    const retry = retryDispatchResult()

    expect(() => AxisPivotDispatchResultSchema.parse({
      ...retry,
      result: {
        ...retry.result,
        sessionId: 'session-other',
      },
    })).toThrow()
    expect(() => AxisPivotDispatchResultSchema.parse({
      ...retry,
      executionRevision: 4,
    })).toThrow()
  })
})

function retryDispatchResult() {
  return {
    authority: 'pivot-main-dispatcher' as const,
    decisionId: 'decision-1',
    executionRevision: 3,
    result: {
      action: 'retry' as const,
      authority: 'pivot-main' as const,
      decisionId: 'decision-1',
      event: {
        detail: 'Retry scheduled by Dynamic Pivot',
        pivotDecisionId: 'decision-1',
        revision: 4,
        taskId: 'task-1',
        timestamp: '2026-07-30T00:00:00.000Z',
        type: 'pivot-retry-scheduled' as const,
      },
      executionRevision: 3,
      outcome: 'scheduled' as const,
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      stateRevision: 4,
      taskId: 'task-1',
    },
    route: 'continuation' as const,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
  }
}

function stopDispatchResult() {
  return {
    authority: 'pivot-main-dispatcher' as const,
    decisionId: 'decision-1',
    executionRevision: 3,
    result: {
      action: 'stop' as const,
      authority: 'pivot-main' as const,
      decisionId: 'decision-1',
      event: {
        detail: 'Stop the Run',
        pivotDecisionId: 'decision-1',
        revision: 4,
        taskId: 'task-1',
        timestamp: '2026-07-30T00:00:00.000Z',
        type: 'pivot-stopped' as const,
      },
      executionRevision: 3,
      forced: false,
      outcome: 'stopped' as const,
      reason: 'Stop the Run',
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      stateRevision: 4,
      stopReason: null,
      taskId: 'task-1',
    },
    route: 'terminal' as const,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
  }
}
