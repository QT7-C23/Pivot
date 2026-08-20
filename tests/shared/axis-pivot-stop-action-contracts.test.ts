import { describe, expect, it } from 'vitest'
import {
  AxisPivotStopActionRequestSchema,
  AxisPivotStopActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis Pivot stop action contracts', () => {
  it('keeps the request limited to four decision-owned identifiers', () => {
    const request = {
      decisionId: 'pivot-stop-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
    }

    expect(AxisPivotStopActionRequestSchema.parse(request)).toEqual(request)
    expect(() => AxisPivotStopActionRequestSchema.parse({
      ...request,
      reason: 'caller-selected',
    })).toThrow()
    expect(() => AxisPivotStopActionRequestSchema.parse({
      ...request,
      stopReason: 'token-limit',
    })).toThrow()
  })

  it('accepts exact decision-bound terminal event evidence', () => {
    const result = stopResult()

    expect(AxisPivotStopActionResultSchema.parse(result)).toEqual(result)
  })

  it('rejects mismatched event, revision, task, reason, and forced evidence', () => {
    const result = stopResult()

    expect(() => AxisPivotStopActionResultSchema.parse({
      ...result,
      stateRevision: result.executionRevision,
    })).toThrow(/revision/i)
    expect(() => AxisPivotStopActionResultSchema.parse({
      ...result,
      event: { ...result.event, type: 'pivot-decided' },
    })).toThrow(/stop/i)
    expect(() => AxisPivotStopActionResultSchema.parse({
      ...result,
      taskId: 'task-other',
    })).toThrow(/task|event/i)
    expect(() => AxisPivotStopActionResultSchema.parse({
      ...result,
      reason: 'forged',
    })).toThrow(/reason|event/i)
    expect(() => AxisPivotStopActionResultSchema.parse({
      ...result,
      forced: false,
    })).toThrow(/forced|stop reason/i)
  })
})

function stopResult() {
  return {
    action: 'stop' as const,
    authority: 'pivot-main' as const,
    decisionId: 'pivot-stop-1',
    event: {
      detail: 'Axis hard budget stopped Dynamic Pivot: pivot-limit',
      pivotDecisionId: 'pivot-stop-1',
      revision: 6,
      taskId: 'inspect',
      timestamp: '2026-07-30T00:00:02.000Z',
      type: 'pivot-stopped' as const,
    },
    executionRevision: 5,
    forced: true,
    outcome: 'stopped' as const,
    reason: 'Axis hard budget stopped Dynamic Pivot: pivot-limit',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    stateRevision: 6,
    stopReason: 'pivot-limit' as const,
    taskId: 'inspect',
  }
}
