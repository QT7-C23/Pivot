import type {
  AxisPivotReplanTaskSchedule,
  AxisPivotReplanTaskScheduleRequest,
} from '../../shared/axis-pivot-replan-task-scheduling-contracts'
import type { AxisPivotContinuationAuthorizationPort } from './axis-pivot-guarded-continuation-ports'
import { AxisPivotReplanTaskScheduleRegistry } from './axis-pivot-replan-task-schedule-registry'
import { AxisPivotReplanTaskScheduler } from './axis-pivot-replan-task-scheduler'
import type {
  AxisPivotReplanPlanReaderPort,
  AxisPivotReplanTaskScheduleReaderPort,
  AxisPivotReplanStateReaderPort,
} from './axis-pivot-replan-task-scheduling-ports'

export interface AxisPivotReplanTaskSchedulingRuntime {
  close(): void
  deleteForSession(sessionId: string): void
  find(
    decisionId: string,
    childStateRevision: number,
  ): AxisPivotReplanTaskSchedule | null
  openReaderPort(): AxisPivotReplanTaskScheduleReaderPort
  readonly ready: Promise<void>
  schedule(
    request: AxisPivotReplanTaskScheduleRequest,
  ): AxisPivotReplanTaskSchedule
}

export function createAxisPivotReplanTaskSchedulingRuntime(options: {
  authorization: AxisPivotContinuationAuthorizationPort | null
  databasePath?: string
  plans: AxisPivotReplanPlanReaderPort | null
  states: AxisPivotReplanStateReaderPort | null
}): AxisPivotReplanTaskSchedulingRuntime | null {
  if (!options.authorization || !options.plans || !options.states) return null
  const schedules = new AxisPivotReplanTaskScheduleRegistry(
    options.databasePath ?? ':memory:',
  )
  const scheduler = new AxisPivotReplanTaskScheduler({
    authorization: options.authorization,
    plans: options.plans,
    schedules,
    states: options.states,
  })
  const ready = Promise.resolve()
  const readerPort = Object.freeze({
    find: (scheduleId: string) => schedules.find(scheduleId),
  })
  let closed = false
  return Object.freeze({
    close() {
      if (closed) return
      closed = true
      schedules.close()
    },
    deleteForSession: (sessionId: string) => schedules.deleteForSession(sessionId),
    find: (decisionId: string, childStateRevision: number) => (
      schedules.findBySource(decisionId, childStateRevision)
    ),
    openReaderPort: () => readerPort,
    ready,
    schedule: (request: AxisPivotReplanTaskScheduleRequest) => scheduler.schedule(request),
  })
}
