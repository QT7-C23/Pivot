import { describe, expect, it } from 'vitest'
import {
  AxisPivotReplanReviewedTaskOrchestrationSchema,
  AxisPivotReplanReviewedTaskRequestSchema,
} from '../../src/shared/axis-pivot-replan-reviewed-task-contracts'
import { replanReviewedTaskPreparing } from '../fixtures/axis-pivot-replan-reviewed-task'

describe('Axis Pivot replan reviewed-task contracts', () => {
  it('accepts only a schedule identity as request input', () => {
    expect(AxisPivotReplanReviewedTaskRequestSchema.parse({
      scheduleId: 'replan-schedule-1',
    })).toEqual({ scheduleId: 'replan-schedule-1' })
    expect(() => AxisPivotReplanReviewedTaskRequestSchema.parse({
      scheduleId: 'replan-schedule-1',
      taskId: 'forged-task',
    })).toThrow()
  })

  it('strictly validates immutable schedule-owned orchestration evidence', () => {
    expect(AxisPivotReplanReviewedTaskOrchestrationSchema.parse(
      replanReviewedTaskPreparing(),
    )).toEqual(replanReviewedTaskPreparing())
    expect(() => AxisPivotReplanReviewedTaskOrchestrationSchema.parse({
      ...replanReviewedTaskPreparing(),
      writes: [{ content: 'forged', filePath: 'src/one.ts' }],
    })).toThrow()
  })
})
