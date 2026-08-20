import { describe, expect, it } from 'vitest'
import {
  AxisPivotSelfRepairActionRequestSchema,
  AxisPivotSelfRepairActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis Pivot self-repair action contracts', () => {
  it('accepts only the decision-bound request fields', () => {
    const request = {
      decisionId: 'pivot-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
    }

    expect(AxisPivotSelfRepairActionRequestSchema.parse(request)).toEqual(request)
    expect(() => AxisPivotSelfRepairActionRequestSchema.parse({
      ...request,
      workerId: 'caller-selected-worker',
    })).toThrow()
    expect(() => AxisPivotSelfRepairActionRequestSchema.parse({
      ...request,
      issue: 'caller-selected-issue',
    })).toThrow()
  })

  it('requires result ownership to match its assignment evidence', () => {
    const result = selfRepairResult()
    expect(AxisPivotSelfRepairActionResultSchema.parse(result)).toEqual(result)
    expect(() => AxisPivotSelfRepairActionResultSchema.parse({
      ...result,
      taskId: 'other-task',
    })).toThrow(/task/i)
    expect(() => AxisPivotSelfRepairActionResultSchema.parse({
      ...result,
      assignment: { ...result.assignment, workerId: 'worker-other' },
    })).toThrow(/worker/i)
  })
})

function selfRepairResult() {
  return {
    action: 'self-repair' as const,
    assignment: {
      assignmentId: 'assignment-1',
      createdAt: '2026-07-29T00:00:02.000Z',
      decisionId: 'pivot-1',
      executionRevision: 5,
      issue: 'Repair the omitted validation',
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      sourceAttempt: 1,
      sourceAttemptId: 'attempt-1',
      status: 'assigned' as const,
      taskId: 'inspect',
      workerId: 'worker-1',
    },
    authority: 'pivot-main' as const,
    decisionId: 'pivot-1',
    executionRevision: 5,
    outcome: 'assigned' as const,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    taskId: 'inspect',
    workerId: 'worker-1',
  }
}
