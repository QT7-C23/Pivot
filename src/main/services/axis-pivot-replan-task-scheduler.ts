import { AxisPivotDispatchResultSchema } from '../../shared/axis-pivot-action-contracts'
import {
  AxisRunStateSchema,
  AxisShadowRunResultSchema,
  type AxisRunState,
  type AxisShadowRunResult,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import { AxisPivotContinuationHandoffSchema } from '../../shared/axis-pivot-failure-contracts'
import {
  AxisPivotReplanTaskScheduleRequestSchema,
  type AxisPivotReplanTaskSchedule,
  type AxisPivotReplanTaskScheduleRequest,
} from '../../shared/axis-pivot-replan-task-scheduling-contracts'
import type { AxisPivotContinuationAuthorizationPort } from './axis-pivot-guarded-continuation-ports'
import type {
  AxisPivotReplanPlanReaderPort,
  AxisPivotReplanStateReaderPort,
  AxisPivotReplanTaskSchedulePort,
  AxisPivotReplanTaskSchedulerPort,
} from './axis-pivot-replan-task-scheduling-ports'

export class AxisPivotReplanTaskScheduler
implements AxisPivotReplanTaskSchedulerPort {
  private readonly authorization: AxisPivotContinuationAuthorizationPort
  private readonly plans: AxisPivotReplanPlanReaderPort
  private readonly schedules: AxisPivotReplanTaskSchedulePort
  private readonly states: AxisPivotReplanStateReaderPort

  constructor(options: {
    authorization: AxisPivotContinuationAuthorizationPort
    plans: AxisPivotReplanPlanReaderPort
    schedules: AxisPivotReplanTaskSchedulePort
    states: AxisPivotReplanStateReaderPort
  }) {
    this.authorization = options.authorization
    this.plans = options.plans
    this.schedules = options.schedules
    this.states = options.states
  }

  schedule(
    input: AxisPivotReplanTaskScheduleRequest,
  ): AxisPivotReplanTaskSchedule {
    const request = AxisPivotReplanTaskScheduleRequestSchema.parse(input)
    const authorization = this.requireAuthorization(request.decisionId)
    const result = authorization.dispatch.result
    if (result.action !== 'replan' || !result.lineage.childRunId) {
      throw new Error('Axis Pivot replan task scheduling requires a child Run')
    }
    const binding = {
      runId: result.lineage.childRunId,
      sessionId: result.sessionId,
    }
    const plan = AxisShadowRunResultSchema.parse(this.plans.find(binding))
    const state = AxisRunStateSchema.parse(this.states.find(binding))
    requireChildOwnership(plan, state, result.lineage)
    const task = requireNextTask(plan, state)
    if (
      task.requiredTools.length !== 1
      || task.requiredTools[0] !== 'fs.safeWrite'
    ) {
      throw new Error(
        `Axis Pivot replan next task requires exactly fs.safeWrite: ${task.id}`,
      )
    }
    return this.schedules.create({
      action: 'replan',
      childRunId: state.runId,
      childStateRevision: state.revision,
      decisionId: result.decisionId,
      dependencyTaskIds: task.dependencies,
      executionRevision: result.executionRevision,
      handoffId: authorization.handoff.handoffId,
      lineageAttemptId: result.lineage.attemptId,
      parentRunId: result.parentRunId,
      sessionId: result.sessionId,
      taskId: task.id,
    }).schedule
  }

  private requireAuthorization(decisionId: string) {
    const found = this.authorization.find(decisionId)
    if (!found) {
      throw new Error(`Axis Pivot continuation authorization not found: ${decisionId}`)
    }
    const dispatch = AxisPivotDispatchResultSchema.parse(found.dispatch)
    const handoff = AxisPivotContinuationHandoffSchema.parse(found.handoff)
    const result = dispatch.result
    if (
      dispatch.decisionId !== decisionId
      || dispatch.route !== 'continuation'
      || result.action !== 'replan'
      || handoff.action !== 'replan'
      || handoff.decisionId !== decisionId
      || handoff.runId !== dispatch.runId
      || handoff.sessionId !== dispatch.sessionId
      || handoff.executionRevision !== dispatch.executionRevision
      || handoff.targetRunId !== result.lineage.childRunId
      || result.parentRunId !== handoff.runId
      || result.sessionId !== handoff.sessionId
    ) {
      throw new Error(
        'Axis Pivot replan task scheduling requires an exact committed handoff',
      )
    }
    return { dispatch, handoff }
  }
}

function requireChildOwnership(
  plan: AxisShadowRunResult,
  state: AxisRunState,
  lineage: Extract<
    ReturnType<typeof AxisPivotDispatchResultSchema.parse>['result'],
    { action: 'replan' }
  >['lineage'],
): void {
  if (
    plan.status !== 'planned'
    || !plan.dag
    || !plan.schedule
    || plan.trace.runId !== lineage.childRunId
    || plan.trace.sessionId !== lineage.sessionId
    || plan.objective !== lineage.objective
    || state.runId !== plan.trace.runId
    || state.sessionId !== plan.trace.sessionId
    || state.objective !== plan.objective
    || JSON.stringify(state.budget) !== JSON.stringify(lineage.budget)
    || (state.status !== 'planned' && state.status !== 'running')
    || JSON.stringify(state.tasks.map(({ taskId }) => taskId))
      !== JSON.stringify(plan.dag.tasks.map(({ id }) => id))
  ) {
    throw new Error('Axis Pivot replan child plan/state ownership mismatch')
  }
  if (state.tasks.some(({ status }) => status === 'running')) {
    throw new Error('Axis Pivot replan cannot schedule while a child task is running')
  }
}

function requireNextTask(
  plan: AxisShadowRunResult,
  state: AxisRunState,
): AxisTask {
  if (!plan.dag || !plan.schedule) {
    throw new Error('Axis Pivot replan child plan is not schedulable')
  }
  const taskStates = new Map(state.tasks.map((task) => [task.taskId, task]))
  for (const taskId of plan.schedule.orderedTaskIds) {
    const task = plan.dag.tasks.find(({ id }) => id === taskId)
    const taskState = taskStates.get(taskId)
    if (!task || taskState?.status !== 'pending') continue
    const ready = task.dependencies.every((dependencyId) => (
      taskStates.get(dependencyId)?.status === 'completed'
    ))
    if (ready) return task
  }
  throw new Error('Axis Pivot replan child Run has no dependency-ready pending task')
}
