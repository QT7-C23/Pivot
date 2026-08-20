import { describe, expect, it, vi } from 'vitest'
import { AxisPlanLineageRegistry } from '../../src/main/services/axis-plan-lineage-registry'
import { AxisPivotCoordinator } from '../../src/main/services/axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from '../../src/main/services/axis-pivot-decision-registry'
import { AxisMainPivotPlanningContextAdapter } from '../../src/main/services/axis-pivot-planning-context-adapter'
import { AxisPivotReplanActionHandler } from '../../src/main/services/axis-pivot-replan-action-handler'
import { AxisReplanCoordinator } from '../../src/main/services/axis-replan-coordinator'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisShadowRunRegistry } from '../../src/main/services/axis-shadow-run-registry'
import type { AxisShadowRunResult } from '../../src/shared/axis-engine-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Pivot replan action Main integration', () => {
  it('materializes one real child lineage for a decided action and reuses it on repeat', async () => {
    const decisions = new AxisPivotDecisionRegistry(':memory:', { clock: sequenceClock() })
    const lineages = new AxisPlanLineageRegistry(':memory:', { clock: sequenceClock() })
    const plans = new AxisShadowRunRegistry(':memory:')
    const states = new AxisRunStateRegistry(':memory:', { clock: sequenceClock() })
    const budget = { ...axisBudget(), maxPivots: 3, maxRetriesPerTask: 2 }
    const parentPlan = axisShadowResult('run-parent', 'session-1')
    plans.save(parentPlan)
    let state = states.create(parentPlan, budget)
    state = states.startDryRun({
      approvedTaskIds: ['inspect'],
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
    })
    state = states.pause({
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
      stopReason: 'time-limit',
    })
    const decisionId = 'pivot-replan-integration'
    await new AxisPivotCoordinator({
      decisions,
      idFactory: () => decisionId,
      model: {
        decidePivot: async () => ({
          output: { action: 'replan', reason: 'The design must be decomposed again', taskId: 'inspect' },
          usage: { costUsd: 0.01, tokens: 10 },
        }),
      },
      states,
    }).decide({
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
      trigger: {
        category: 'design',
        evidenceIds: ['review-1'],
        summary: 'The task boundary is invalid',
        taskId: 'inspect',
      },
    })
    state = states.get(state.runId)!
    const planner = { plan: vi.fn(async () => childPlan()) }
    const replans = new AxisReplanCoordinator({
      idFactory: () => 'replan-action-integration',
      lineages,
      planner,
      plans,
      states,
    })
    const handler = new AxisPivotReplanActionHandler({
      contexts: new AxisMainPivotPlanningContextAdapter({
        files: { list: async () => ['src/main/app.ts'] },
        projects: {
          findBySession: () => ({
            boundAt: '2026-07-29T00:00:00.000Z',
            projectId: 'project-1',
            projectRoot: 'D:\\project',
            schemaVersion: 1,
            sessionId: 'session-1',
          }),
        },
      }),
      decisions: decisions.openActionReaderPort(),
      replans: replans.openActionPort(),
      states: states.openPivotActionReaderPort(),
    })
    const request = {
      decisionId,
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
    }

    const created = await handler.execute(request)
    const repeated = await handler.execute(request)

    expect(created).toMatchObject({
      lineage: { childRunId: 'run-child', status: 'completed' },
      outcome: 'created',
    })
    expect(repeated).toMatchObject({
      lineage: { attemptId: created.lineage.attemptId, childRunId: 'run-child' },
      outcome: 'already-completed',
    })
    expect(planner.plan).toHaveBeenCalledTimes(1)
    expect(Object.isFrozen(decisions.openActionReaderPort())).toBe(true)
    expect(Object.isFrozen(replans.openActionPort())).toBe(true)
    expect(Object.isFrozen(states.openPivotActionReaderPort())).toBe(true)
    expect(plans.get('run-child')).toEqual(childPlan())
    expect(states.get('run-child')).toMatchObject({
      objective: state.objective,
      status: 'planned',
    })

    decisions.close()
    lineages.close()
    plans.close()
    states.close()
  })
})

function childPlan(): AxisShadowRunResult {
  const plan = axisShadowResult('run-child', 'session-1')
  return {
    ...plan,
    dag: {
      ...plan.dag!,
      tasks: plan.dag!.tasks.map((task) => ({
        ...task,
        assignedFiles: ['src/main/app.ts'],
      })),
    },
  }
}

function sequenceClock(): () => Date {
  let millisecond = 0
  return () => new Date(`2026-07-29T00:00:00.${String(millisecond++).padStart(3, '0')}Z`)
}
