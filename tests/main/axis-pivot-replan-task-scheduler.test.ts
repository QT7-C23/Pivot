import { describe, expect, it } from 'vitest'
import { AxisPivotReplanTaskScheduleRegistry } from '../../src/main/services/axis-pivot-replan-task-schedule-registry'
import { AxisPivotReplanTaskScheduler } from '../../src/main/services/axis-pivot-replan-task-scheduler'
import {
  replanAuthorization,
  replanChildPlan,
  replanChildState,
  replanChildStateAfterFirstTask,
} from '../fixtures/axis-pivot-replan-task-scheduling'

describe('AxisPivotReplanTaskScheduler', () => {
  it('derives and persists each dependency-ready child task by authoritative state revision', () => {
    let state = replanChildState()
    const fixture = createScheduler(() => state)

    const first = fixture.scheduler.schedule({ decisionId: 'decision-replan-1' })
    const duplicate = fixture.scheduler.schedule({ decisionId: 'decision-replan-1' })
    expect(first).toMatchObject({
      childStateRevision: 1,
      dependencyTaskIds: [],
      taskId: 'child-task-1',
    })
    expect(duplicate).toEqual(first)

    state = replanChildStateAfterFirstTask()
    const second = fixture.scheduler.schedule({ decisionId: 'decision-replan-1' })
    expect(second).toMatchObject({
      childStateRevision: 4,
      dependencyTaskIds: ['child-task-1'],
      taskId: 'child-task-2',
    })
    fixture.close()
  })

  it('fails closed when the authoritative next task is not a safe-write task', () => {
    const plan = replanChildPlan()
    plan.dag!.tasks[0] = {
      ...plan.dag!.tasks[0]!,
      requiredTools: ['read'],
    }
    const fixture = createScheduler(() => replanChildState(), plan)
    expect(() => fixture.scheduler.schedule({
      decisionId: 'decision-replan-1',
    })).toThrow(/safe.write|fs\.safeWrite/i)
    expect(fixture.schedules.findBySource('decision-replan-1', 1)).toBeNull()
    fixture.close()
  })

  it('rejects forged replan ownership and child-plan drift', () => {
    const authorization = replanAuthorization()
    authorization.handoff.targetRunId = 'forged-child'
    const forged = createScheduler(() => replanChildState(), replanChildPlan(), authorization)
    expect(() => forged.scheduler.schedule({
      decisionId: 'decision-replan-1',
    })).toThrow(/handoff|ownership|replan/i)
    forged.close()

    const plan = replanChildPlan()
    plan.trace.sessionId = 'other-session'
    const drifted = createScheduler(() => replanChildState(), plan)
    expect(() => drifted.scheduler.schedule({
      decisionId: 'decision-replan-1',
    })).toThrow(/plan|ownership|session/i)
    drifted.close()

    const budgetDrifted = createScheduler(() => ({
      ...replanChildState(),
      budget: {
        ...replanChildState().budget,
        maxPivots: 2,
      },
    }))
    expect(() => budgetDrifted.scheduler.schedule({
      decisionId: 'decision-replan-1',
    })).toThrow(/budget|ownership/i)
    budgetDrifted.close()
  })
})

function createScheduler(
  state: () => ReturnType<typeof replanChildState>,
  plan = replanChildPlan(),
  authorization = replanAuthorization(),
) {
  const schedules = new AxisPivotReplanTaskScheduleRegistry(':memory:', {
    clock: () => new Date('2026-08-02T01:00:00.000Z'),
    idFactory: () => `replan-schedule-${state().revision}`,
  })
  return {
    close: () => schedules.close(),
    scheduler: new AxisPivotReplanTaskScheduler({
      authorization: { find: () => authorization },
      plans: { find: () => plan },
      schedules,
      states: { find: () => state() },
    }),
    schedules,
  }
}
