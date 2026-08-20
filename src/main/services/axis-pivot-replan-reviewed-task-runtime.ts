import type {
  AxisPivotReplanReviewedTaskOrchestration,
  AxisPivotReplanReviewedTaskRequest,
} from '../../shared/axis-pivot-replan-reviewed-task-contracts'
import type {
  AxisPivotContinuationAuthorizationPort,
  AxisPivotGuardedContinuationConsumerPort,
} from './axis-pivot-guarded-continuation-ports'
import { AxisPivotReplanReviewedTaskOrchestrator } from './axis-pivot-replan-reviewed-task-orchestrator'
import { AxisPivotReplanReviewedTaskRegistry } from './axis-pivot-replan-reviewed-task-registry'
import type { AxisPivotReplanTaskScheduleReaderPort } from './axis-pivot-replan-task-scheduling-ports'
import type { AxisSafeWriteProposalPort } from './axis-pivot-reviewed-continuation-ports'

export interface AxisPivotReplanReviewedTaskRuntime {
  close(): void
  deleteForSession(sessionId: string): void
  find(scheduleId: string): AxisPivotReplanReviewedTaskOrchestration | null
  orchestrate(
    request: AxisPivotReplanReviewedTaskRequest,
  ): Promise<AxisPivotReplanReviewedTaskOrchestration>
  readonly ready: Promise<void>
}

export function createAxisPivotReplanReviewedTaskRuntime(options: {
  authorization: AxisPivotContinuationAuthorizationPort | null
  continuations: AxisPivotGuardedContinuationConsumerPort | null
  databasePath?: string
  proposals: AxisSafeWriteProposalPort | null
  schedules: AxisPivotReplanTaskScheduleReaderPort | null
}): AxisPivotReplanReviewedTaskRuntime | null {
  if (
    !options.authorization
    || !options.continuations
    || !options.proposals
    || !options.schedules
  ) return null

  const orchestrations = new AxisPivotReplanReviewedTaskRegistry(
    options.databasePath ?? ':memory:',
  )
  const orchestrator = new AxisPivotReplanReviewedTaskOrchestrator({
    authorization: options.authorization,
    continuations: options.continuations,
    orchestrations,
    proposals: options.proposals,
    schedules: options.schedules,
  })
  const ready = Promise.resolve().then(() => {
    orchestrations.recoverInterrupted()
  })
  let closed = false

  return Object.freeze({
    close() {
      if (closed) return
      closed = true
      orchestrations.close()
    },
    deleteForSession: (sessionId: string) => orchestrations.deleteForSession(sessionId),
    find: (scheduleId: string) => orchestrations.findBySchedule(scheduleId),
    orchestrate: (request: AxisPivotReplanReviewedTaskRequest) => (
      orchestrator.orchestrate(request)
    ),
    ready,
  })
}
