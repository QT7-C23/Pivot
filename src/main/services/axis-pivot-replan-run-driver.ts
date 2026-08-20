import { AxisRunStateSchema } from '../../shared/axis-engine-contracts'
import {
  AxisPivotReplanReviewedTaskOrchestrationSchema,
} from '../../shared/axis-pivot-replan-reviewed-task-contracts'
import {
  AxisPivotReplanRunDriveRequestSchema,
  AxisPivotReplanRunDriveResultSchema,
  type AxisPivotReplanRunDriveResult,
} from '../../shared/axis-pivot-replan-run-driver-contracts'
import { AxisPivotReplanTaskScheduleSchema } from '../../shared/axis-pivot-replan-task-scheduling-contracts'
import type { AxisPivotReplanReviewedTaskOrchestratorPort } from './axis-pivot-replan-reviewed-task-ports'
import type {
  AxisPivotReplanRunDriveResultPort,
  AxisPivotReplanRunDriverPort,
} from './axis-pivot-replan-run-driver-ports'
import type { AxisPivotReplanTaskSchedulerPort } from './axis-pivot-replan-task-scheduling-ports'

const MAX_DRIVEN_TASKS = 100

export class AxisPivotReplanRunDriver implements AxisPivotReplanRunDriverPort {
  private readonly inFlight = new Map<string, Promise<AxisPivotReplanRunDriveResult>>()

  constructor(private readonly options: {
    reviewedTasks: AxisPivotReplanReviewedTaskOrchestratorPort
    results: AxisPivotReplanRunDriveResultPort
    scheduler: AxisPivotReplanTaskSchedulerPort
  }) {}

  drive(input: Parameters<AxisPivotReplanRunDriverPort['drive']>[0]) {
    const request = AxisPivotReplanRunDriveRequestSchema.parse(input)
    const persisted = this.options.results.find(request.decisionId)
    if (persisted) return Promise.resolve(persisted)
    const existing = this.inFlight.get(request.decisionId)
    if (existing) return existing
    const operation = this.driveOnce(request.decisionId).finally(() => {
      if (this.inFlight.get(request.decisionId) === operation) {
        this.inFlight.delete(request.decisionId)
      }
    })
    this.inFlight.set(request.decisionId, operation)
    return operation
  }

  private async driveOnce(decisionId: string): Promise<AxisPivotReplanRunDriveResult> {
    const scheduleIds: string[] = []
    const orchestrationIds: string[] = []
    const completedTaskIds: string[] = []
    let ownership: {
      childRunId: string
      parentRunId: string
      sessionId: string
    } | null = null

    for (let count = 0; count < MAX_DRIVEN_TASKS; count += 1) {
      const schedule = AxisPivotReplanTaskScheduleSchema.parse(
        this.options.scheduler.schedule({ decisionId }),
      )
      if (schedule.decisionId !== decisionId) {
        throw new Error('Axis Pivot replan driver schedule decision mismatch')
      }
      ownership ??= {
        childRunId: schedule.childRunId,
        parentRunId: schedule.parentRunId,
        sessionId: schedule.sessionId,
      }
      if (
        ownership.childRunId !== schedule.childRunId
        || ownership.parentRunId !== schedule.parentRunId
        || ownership.sessionId !== schedule.sessionId
      ) throw new Error('Axis Pivot replan driver schedule ownership drift')
      if (scheduleIds.includes(schedule.scheduleId)) {
        throw new Error(`Axis Pivot replan driver repeated schedule: ${schedule.scheduleId}`)
      }
      scheduleIds.push(schedule.scheduleId)

      const orchestration = AxisPivotReplanReviewedTaskOrchestrationSchema.parse(
        await this.options.reviewedTasks.orchestrate({ scheduleId: schedule.scheduleId }),
      )
      if (
        orchestration.status !== 'completed'
        || !orchestration.continuationAttempt
        || orchestration.scheduleId !== schedule.scheduleId
        || orchestration.decisionId !== decisionId
        || orchestration.targetRunId !== schedule.childRunId
        || orchestration.sourceRunId !== schedule.parentRunId
        || orchestration.sessionId !== schedule.sessionId
        || orchestration.submittedTaskId !== schedule.taskId
        || orchestration.childStateRevision !== schedule.childStateRevision
      ) throw new Error('Axis Pivot replan driver orchestration ownership mismatch')
      orchestrationIds.push(orchestration.orchestrationId)

      const guarded = orchestration.continuationAttempt.guardedResult
      if (!guarded) throw new Error('Axis Pivot replan driver requires a Guarded result')
      const runState = AxisRunStateSchema.parse(guarded.runState)
      if (
        runState.runId !== schedule.childRunId
        || runState.sessionId !== schedule.sessionId
      ) throw new Error('Axis Pivot replan driver Run-state ownership mismatch')

      if (guarded.execution.status !== 'completed') {
        return this.options.results.save(parseResult({
          completedTaskIds,
          decisionId,
          failureReason: guarded.execution.detail,
          finalStateRevision: runState.revision,
          orchestrationIds,
          ownership,
          scheduleIds,
          status: 'failed',
        }))
      }
      const task = runState.tasks.find(({ taskId }) => taskId === schedule.taskId)
      if (task?.status !== 'completed') {
        throw new Error('Axis Pivot replan driver requires authoritative Task completion')
      }
      completedTaskIds.push(schedule.taskId)
      if (runState.status === 'completed') {
        return this.options.results.save(parseResult({
          completedTaskIds,
          decisionId,
          failureReason: null,
          finalStateRevision: runState.revision,
          orchestrationIds,
          ownership,
          scheduleIds,
          status: 'completed',
        }))
      }
      if (runState.status !== 'running') {
        throw new Error(`Axis Pivot replan driver cannot continue child Run status: ${runState.status}`)
      }
    }
    throw new Error(`Axis Pivot replan driver exceeded ${MAX_DRIVEN_TASKS} Tasks`)
  }
}

function parseResult(input: {
  completedTaskIds: string[]
  decisionId: string
  failureReason: string | null
  finalStateRevision: number
  orchestrationIds: string[]
  ownership: { childRunId: string; parentRunId: string; sessionId: string }
  scheduleIds: string[]
  status: 'completed' | 'failed'
}): AxisPivotReplanRunDriveResult {
  return AxisPivotReplanRunDriveResultSchema.parse({
    action: 'replan', authority: 'pivot-main-replan-run-driver',
    childRunId: input.ownership.childRunId,
    completedTaskIds: input.completedTaskIds,
    decisionId: input.decisionId,
    failureReason: input.failureReason,
    finalStateRevision: input.finalStateRevision,
    orchestrationIds: input.orchestrationIds,
    parentRunId: input.ownership.parentRunId,
    scheduleIds: input.scheduleIds,
    schemaVersion: 1,
    sessionId: input.ownership.sessionId,
    status: input.status,
  })
}
