import type {
  AxisRunState,
  AxisShadowRunResult,
} from '../../shared/axis-engine-contracts'
import type {
  AxisPivotReplanTaskSchedule,
  AxisPivotReplanTaskScheduleRequest,
} from '../../shared/axis-pivot-replan-task-scheduling-contracts'

export type AxisPivotReplanTaskScheduleCreateInput = Omit<
  AxisPivotReplanTaskSchedule,
  'authority' | 'createdAt' | 'scheduleId' | 'schemaVersion' | 'status'
>

export interface AxisPivotReplanTaskScheduleCreateResult {
  created: boolean
  schedule: AxisPivotReplanTaskSchedule
}

export interface AxisPivotReplanTaskSchedulePort {
  create(
    input: AxisPivotReplanTaskScheduleCreateInput,
  ): AxisPivotReplanTaskScheduleCreateResult
  findBySource(
    decisionId: string,
    childStateRevision: number,
  ): AxisPivotReplanTaskSchedule | null
}

export interface AxisPivotReplanTaskScheduleReaderPort {
  find(scheduleId: string): AxisPivotReplanTaskSchedule | null
}

export interface AxisPivotReplanPlanReaderPort {
  find(input: { runId: string; sessionId: string }): AxisShadowRunResult | null
}

export interface AxisPivotReplanStateReaderPort {
  find(input: { runId: string; sessionId: string }): AxisRunState | null
}

export interface AxisPivotReplanTaskSchedulerPort {
  schedule(
    request: AxisPivotReplanTaskScheduleRequest,
  ): AxisPivotReplanTaskSchedule
}
