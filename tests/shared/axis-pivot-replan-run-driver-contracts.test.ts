import { describe, expect, it } from 'vitest'
import { AxisPivotReplanRunDriveResultSchema } from '../../src/shared/axis-pivot-replan-run-driver-contracts'

describe('Axis Pivot replan Run driver contracts', () => {
  it('accepts a completed bounded child-Run drive result', () => {
    expect(AxisPivotReplanRunDriveResultSchema.parse({
      action: 'replan', authority: 'pivot-main-replan-run-driver',
      childRunId: 'child-1', completedTaskIds: ['task-1', 'task-2'],
      decisionId: 'decision-1', failureReason: null, finalStateRevision: 7,
      orchestrationIds: ['orchestration-1', 'orchestration-2'],
      parentRunId: 'parent-1', scheduleIds: ['schedule-1', 'schedule-2'],
      schemaVersion: 1, sessionId: 'session-1', status: 'completed',
    })).toMatchObject({ status: 'completed', finalStateRevision: 7 })
  })

  it('rejects duplicate evidence and inconsistent terminal fields', () => {
    const base = {
      action: 'replan', authority: 'pivot-main-replan-run-driver',
      childRunId: 'child-1', completedTaskIds: ['task-1'],
      decisionId: 'decision-1', failureReason: null, finalStateRevision: 4,
      orchestrationIds: ['orchestration-1'], parentRunId: 'parent-1',
      scheduleIds: ['schedule-1'], schemaVersion: 1, sessionId: 'session-1',
      status: 'completed',
    }
    expect(() => AxisPivotReplanRunDriveResultSchema.parse({
      ...base, completedTaskIds: ['task-1', 'task-1'],
    })).toThrow()
    expect(() => AxisPivotReplanRunDriveResultSchema.parse({
      ...base, failureReason: 'blocked', status: 'completed',
    })).toThrow()
    expect(() => AxisPivotReplanRunDriveResultSchema.parse({
      ...base, failureReason: null, status: 'failed',
    })).toThrow()
  })
})
