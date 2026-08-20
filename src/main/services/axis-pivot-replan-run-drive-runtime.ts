import type {
  AxisPivotReplanRunDriveRequest,
  AxisPivotReplanRunDriveResult,
} from '../../shared/axis-pivot-replan-run-driver-contracts'
import type { AxisPivotReplanReviewedTaskOrchestratorPort } from './axis-pivot-replan-reviewed-task-ports'
import { AxisPivotReplanRunDriveRegistry } from './axis-pivot-replan-run-drive-registry'
import { AxisPivotReplanRunDriver } from './axis-pivot-replan-run-driver'
import type { AxisPivotReplanTaskSchedulerPort } from './axis-pivot-replan-task-scheduling-ports'

export interface AxisPivotReplanRunDriveRuntime {
  close(): void
  deleteForSession(sessionId: string): void
  drive(request: AxisPivotReplanRunDriveRequest): Promise<AxisPivotReplanRunDriveResult>
  find(decisionId: string): AxisPivotReplanRunDriveResult | null
  readonly ready: Promise<void>
}

export function createAxisPivotReplanRunDriveRuntime(options: {
  databasePath?: string
  reviewedTasks: AxisPivotReplanReviewedTaskOrchestratorPort | null
  scheduler: AxisPivotReplanTaskSchedulerPort | null
}): AxisPivotReplanRunDriveRuntime | null {
  if (!options.reviewedTasks || !options.scheduler) return null
  const results = new AxisPivotReplanRunDriveRegistry(options.databasePath ?? ':memory:')
  const driver = new AxisPivotReplanRunDriver({
    results,
    reviewedTasks: options.reviewedTasks,
    scheduler: options.scheduler,
  })
  let closed = false
  return Object.freeze({
    close() {
      if (closed) return
      closed = true
      results.close()
    },
    deleteForSession: (sessionId: string) => results.deleteForSession(sessionId),
    drive: (request: AxisPivotReplanRunDriveRequest) => driver.drive(request),
    find: (decisionId: string) => results.find(decisionId),
    ready: Promise.resolve(),
  })
}
