import { describe, expect, it } from 'vitest'
import {
  AxisPivotReplanTaskScheduleRequestSchema,
  AxisPivotReplanTaskScheduleSchema,
} from '../../src/shared/axis-pivot-replan-task-scheduling-contracts'
import { scheduledTaskEvidence } from '../fixtures/axis-pivot-replan-task-scheduling'

describe('Axis Pivot replan task scheduling contracts', () => {
  it('accepts the strict decision-only request and immutable schedule evidence', () => {
    expect(AxisPivotReplanTaskScheduleRequestSchema.parse({
      decisionId: 'decision-replan-1',
    })).toEqual({ decisionId: 'decision-replan-1' })
    expect(AxisPivotReplanTaskScheduleSchema.parse(scheduledTaskEvidence()))
      .toEqual(scheduledTaskEvidence())
  })

  it('rejects caller-selected authority and malformed dependency evidence', () => {
    expect(() => AxisPivotReplanTaskScheduleRequestSchema.parse({
      decisionId: 'decision-replan-1',
      taskId: 'forged-task',
    })).toThrow()
    expect(() => AxisPivotReplanTaskScheduleSchema.parse({
      ...scheduledTaskEvidence(),
      dependencyTaskIds: ['child-task-1'],
    })).toThrow(/depend|task/i)
  })
})
