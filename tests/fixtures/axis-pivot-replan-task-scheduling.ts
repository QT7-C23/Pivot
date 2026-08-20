import type { AxisPivotDispatchResult } from '../../src/shared/axis-pivot-action-contracts'
import type { AxisPivotContinuationHandoff } from '../../src/shared/axis-pivot-failure-contracts'
import type {
  AxisRunState,
  AxisShadowRunResult,
  WorkerResult,
} from '../../src/shared/axis-engine-contracts'
import {
  completeAxisGuardedTask,
  createAxisRunState,
  startAxisGuardedTask,
} from '../../src/shared/axis-run-state'
import { axisBudget, emptyUsage } from './axis-shadow-run'

export function replanChildPlan(): AxisShadowRunResult {
  const createdAt = '2026-08-02T01:00:00.000Z'
  return {
    complexity: {
      confidence: 1,
      policyAdjustments: [],
      reasons: ['Two ordered guarded repairs'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      riskFlags: [],
      route: 'single-agent',
      schemaVersion: 1,
      score: 2,
      suggestedWorkers: 1,
    },
    dag: {
      createdAt,
      dagId: 'dag-child-1',
      objective: 'Repair the child run',
      schemaVersion: 1,
      tasks: [{
        assignedFiles: ['src/one.ts'],
        dependencies: [],
        estimatedComplexity: 1,
        id: 'child-task-1',
        objective: 'Repair the first file',
        requiredTools: ['fs.safeWrite'],
        requiredGates: ['compile', 'test'],
        requiresHumanReview: false,
        spawnDepth: 1,
        title: 'Repair first file',
      }, {
        assignedFiles: ['src/two.ts'],
        dependencies: ['child-task-1'],
        estimatedComplexity: 1,
        id: 'child-task-2',
        objective: 'Repair the dependent file',
        requiredTools: ['fs.safeWrite'],
        requiredGates: ['compile', 'test'],
        requiresHumanReview: false,
        spawnDepth: 1,
        title: 'Repair second file',
      }],
    },
    mode: 'shadow',
    objective: 'Repair the child run',
    schedule: {
      batches: [['child-task-1'], ['child-task-2']],
      orderedTaskIds: ['child-task-1', 'child-task-2'],
      warnings: [],
    },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{
        detail: 'planned',
        sequence: 1,
        taskId: null,
        timestamp: createdAt,
        type: 'run-completed',
      }],
      runId: 'run-child-1',
      sessionId: 'session-1',
      startedAt: createdAt,
      traceId: 'trace-child-1',
    },
    usage: emptyUsage(),
  }
}

export function replanChildState(): AxisRunState {
  return createAxisRunState(
    replanChildPlan(),
    { ...axisBudget(), maxPivots: 1, maxRetriesPerTask: 1 },
    '2026-08-02T01:00:00.000Z',
  )
}

export function replanChildStateAfterFirstTask(): AxisRunState {
  let state = replanChildState()
  const task = replanChildPlan().dag!.tasks[0]!
  state = startAxisGuardedTask(
    state,
    task.id,
    task.dependencies,
    '2026-08-02T01:00:01.000Z',
  )
  const result: WorkerResult = {
    artifacts: [],
    findings: [],
    status: 'completed',
    summary: 'First repair completed',
    taskId: task.id,
    usage: { costUsd: 0, durationMs: 1, tokens: 0 },
  }
  return completeAxisGuardedTask(
    state,
    result,
    '2026-08-02T01:00:02.000Z',
  )
}

export function replanAuthorization(): {
  dispatch: AxisPivotDispatchResult
  handoff: AxisPivotContinuationHandoff
} {
  const budget = { ...axisBudget(), maxPivots: 1, maxRetriesPerTask: 1 }
  return {
    dispatch: {
      authority: 'pivot-main-dispatcher',
      decisionId: 'decision-replan-1',
      executionRevision: 3,
      result: {
        action: 'replan',
        authority: 'pivot-main',
        decisionId: 'decision-replan-1',
        executionRevision: 3,
        lineage: {
          attemptId: 'replan-attempt-1',
          budget,
          childRunId: 'run-child-1',
          createdAt: '2026-08-02T00:59:58.000Z',
          error: null,
          fileScope: ['src/one.ts', 'src/two.ts'],
          fileScopeDigest: '1'.repeat(64),
          generation: 2,
          objective: 'Repair the child run',
          objectiveDigest: '2'.repeat(64),
          parentRunId: 'run-parent-1',
          rootRunId: 'run-parent-1',
          schemaVersion: 1,
          sessionId: 'session-1',
          sourceRevision: 3,
          status: 'completed',
          updatedAt: '2026-08-02T00:59:59.000Z',
        },
        outcome: 'created',
        parentRunId: 'run-parent-1',
        schemaVersion: 1,
        sessionId: 'session-1',
      },
      route: 'continuation',
      runId: 'run-parent-1',
      schemaVersion: 1,
      sessionId: 'session-1',
    },
    handoff: {
      action: 'replan',
      createdAt: '2026-08-02T01:00:00.000Z',
      decisionId: 'decision-replan-1',
      executionRevision: 3,
      failureEvidenceId: 'failure-1',
      handoffId: 'handoff-replan-1',
      runId: 'run-parent-1',
      schemaVersion: 1,
      sessionId: 'session-1',
      status: 'pending-guarded-review',
      targetRunId: 'run-child-1',
    },
  }
}

export function scheduledTaskEvidence() {
  return {
    action: 'replan' as const,
    authority: 'pivot-main-replan-task-scheduler' as const,
    childRunId: 'run-child-1',
    childStateRevision: 1,
    createdAt: '2026-08-02T01:00:00.000Z',
    decisionId: 'decision-replan-1',
    dependencyTaskIds: [],
    executionRevision: 3,
    handoffId: 'handoff-replan-1',
    lineageAttemptId: 'replan-attempt-1',
    parentRunId: 'run-parent-1',
    scheduleId: 'replan-schedule-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    status: 'scheduled' as const,
    taskId: 'child-task-1',
  }
}
