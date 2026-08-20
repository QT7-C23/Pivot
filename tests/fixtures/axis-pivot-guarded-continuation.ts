import type { AxisPivotDispatchResult } from '../../src/shared/axis-pivot-action-contracts'
import type { AxisPivotContinuationHandoff } from '../../src/shared/axis-pivot-failure-contracts'
import type {
  AxisGuardedSafeWriteSubmission,
  AxisGuardedSafeWriteSubmissionResult,
} from '../../src/shared/axis-guarded-safe-write-contracts'
import type { AxisTask, WorkerResult } from '../../src/shared/axis-engine-contracts'
import {
  completeAxisGuardedTask,
  createAxisRunState,
  recordAxisSafeWriteProposalUsage,
  startAxisGuardedTask,
} from '../../src/shared/axis-run-state'
import type { AxisSafeWriteProposalResult } from '../../src/shared/axis-safe-write-proposal-contracts'
import { axisBudget } from './axis-shadow-run'

export const guardedTask: AxisTask = {
  assignedFiles: ['src/one.ts'],
  dependencies: [],
  estimatedComplexity: 1,
  id: 'task-1',
  objective: 'Safely repair one file',
  requiredTools: ['fs.safeWrite'],
  requiredGates: ['compile', 'test'],
  requiresHumanReview: false,
  spawnDepth: 1,
  title: 'Repair file',
}

export function guardedContinuationRequest(
  overrides: Partial<AxisGuardedSafeWriteSubmission> = {},
) {
  return {
    decisionId: 'decision-1',
    handoffId: 'continuation-1',
    submission: {
      expectedRevision: 5,
      reviewedProposalReceipt: reviewedReceipt(),
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
      ...overrides,
    },
  }
}

export function retryAuthorization(): {
  dispatch: AxisPivotDispatchResult
  handoff: AxisPivotContinuationHandoff
} {
  return {
    dispatch: {
      authority: 'pivot-main-dispatcher',
      decisionId: 'decision-1',
      executionRevision: 3,
      result: {
        action: 'retry',
        authority: 'pivot-main',
        decisionId: 'decision-1',
        event: {
          detail: 'Retry scheduled by Dynamic Pivot',
          pivotDecisionId: 'decision-1',
          revision: 4,
          taskId: 'task-1',
          timestamp: '2026-07-30T00:00:00.020Z',
          type: 'pivot-retry-scheduled',
        },
        executionRevision: 3,
        outcome: 'scheduled',
        runId: 'run-1',
        schemaVersion: 1,
        sessionId: 'session-1',
        stateRevision: 4,
        taskId: 'task-1',
      },
      route: 'continuation',
      runId: 'run-1',
      schemaVersion: 1,
      sessionId: 'session-1',
    },
    handoff: handoff(),
  }
}

export function selfRepairAuthorization(options: {
  scheduled?: boolean
} = {}): {
  dispatch: AxisPivotDispatchResult
  handoff: AxisPivotContinuationHandoff
} {
  return {
    dispatch: {
      authority: 'pivot-main-dispatcher',
      decisionId: 'decision-1',
      executionRevision: 3,
      result: options.scheduled === false ? {
        action: 'self-repair',
        assignment: {
          assignmentId: 'assignment-1',
          createdAt: '2026-07-30T00:00:00.020Z',
          decisionId: 'decision-1',
          executionRevision: 3,
          issue: 'Repair the failed task',
          runId: 'run-1',
          schemaVersion: 1,
          sessionId: 'session-1',
          sourceAttempt: 1,
          sourceAttemptId: 'attempt-1',
          status: 'assigned',
          taskId: 'task-1',
          workerId: 'worker-1',
        },
        authority: 'pivot-main',
        decisionId: 'decision-1',
        executionRevision: 3,
        outcome: 'assigned',
        runId: 'run-1',
        schemaVersion: 1,
        sessionId: 'session-1',
        taskId: 'task-1',
        workerId: 'worker-1',
      } : {
        action: 'self-repair',
        assignment: {
          assignmentId: 'assignment-1',
          createdAt: '2026-07-30T00:00:00.020Z',
          decisionId: 'decision-1',
          executionRevision: 3,
          issue: 'Repair the failed task',
          runId: 'run-1',
          schemaVersion: 1,
          sessionId: 'session-1',
          sourceAttempt: 1,
          sourceAttemptId: 'attempt-1',
          status: 'assigned',
          taskId: 'task-1',
          workerId: 'worker-1',
        },
        authority: 'pivot-main',
        decisionId: 'decision-1',
        event: {
          detail: 'Self-repair scheduled by Dynamic Pivot',
          pivotDecisionId: 'decision-1',
          revision: 4,
          taskId: 'task-1',
          timestamp: '2026-07-30T00:00:00.020Z',
          type: 'pivot-self-repair-scheduled',
        },
        executionRevision: 3,
        outcome: 'assigned',
        runId: 'run-1',
        scheduleOutcome: 'scheduled',
        schemaVersion: 2,
        sessionId: 'session-1',
        stateRevision: 4,
        taskId: 'task-1',
        workerId: 'worker-1',
      },
      route: 'continuation',
      runId: 'run-1',
      schemaVersion: 1,
      sessionId: 'session-1',
    },
    handoff: { ...handoff(), action: 'self-repair' },
  }
}

export function dedicatedFixerAuthorization(): {
  dispatch: AxisPivotDispatchResult
  handoff: AxisPivotContinuationHandoff
} {
  const result = selfRepairAuthorization().dispatch.result
  if (result.action !== 'self-repair' || result.schemaVersion !== 2) {
    throw new Error('Expected scheduled self-repair fixture')
  }
  return {
    dispatch: {
      ...selfRepairAuthorization().dispatch,
      result: {
        action: 'dedicated-fixer',
        assignment: {
          assignmentId: 'fixer-assignment-1',
          createdAt: result.assignment.createdAt,
          decisionId: result.decisionId,
          executionRevision: result.executionRevision,
          fixer: {
            fixerId: 'security-fixer-1',
            role: 'security-fixer',
            schemaVersion: 1,
            specialty: 'security',
          },
          issue: result.assignment.issue,
          runId: result.runId,
          schemaVersion: 1,
          sessionId: result.sessionId,
          sourceAttempt: result.assignment.sourceAttempt,
          sourceAttemptId: result.assignment.sourceAttemptId,
          sourceWorkerId: result.workerId,
          status: 'assigned',
          taskId: result.taskId,
        },
        authority: 'pivot-main',
        decisionId: result.decisionId,
        event: {
          ...result.event,
          detail: 'Dedicated Fixer scheduled by Dynamic Pivot',
          type: 'pivot-dedicated-fixer-scheduled',
        },
        executionRevision: result.executionRevision,
        fixerId: 'security-fixer-1',
        outcome: 'assigned',
        runId: result.runId,
        scheduleOutcome: 'scheduled',
        schemaVersion: 2,
        sessionId: result.sessionId,
        stateRevision: result.stateRevision,
        taskId: result.taskId,
      },
    },
    handoff: { ...handoff(), action: 'dedicated-fixer' },
  }
}

export function guardedSubmissionResult(): AxisGuardedSafeWriteSubmissionResult {
  let state = createAxisRunState({
    complexity: {
      confidence: 1,
      policyAdjustments: [],
      reasons: ['One guarded repair'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      riskFlags: [],
      route: 'single-agent',
      schemaVersion: 1,
      score: 1,
      suggestedWorkers: 1,
    },
    dag: {
      createdAt: '2026-07-30T00:00:00.000Z',
      dagId: 'dag-1',
      objective: 'Repair one file',
      schemaVersion: 1,
      tasks: [guardedTask],
    },
    mode: 'shadow',
    objective: 'Repair one file',
    schedule: {
      batches: [['task-1']],
      orderedTaskIds: ['task-1'],
      warnings: [],
    },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{
        detail: 'planned',
        sequence: 1,
        taskId: null,
        timestamp: '2026-07-30T00:00:00.000Z',
        type: 'run-completed',
      }],
      runId: 'run-1',
      sessionId: 'session-1',
      startedAt: '2026-07-30T00:00:00.000Z',
      traceId: 'trace-1',
    },
    usage: {
      costUsd: 0,
      durationMs: 0,
      gateCyclesForFile: 0,
      pivots: 0,
      retriesForTask: 0,
      tokens: 0,
    },
  }, axisBudget(), '2026-07-30T00:00:00.000Z')
  state = startAxisGuardedTask(
    state,
    guardedTask.id,
    guardedTask.dependencies,
    '2026-07-30T00:00:01.000Z',
  )
  const worker: WorkerResult = {
    artifacts: [],
    findings: ['feature-disabled'],
    status: 'failed',
    summary: 'Axis real file execution is disabled',
    taskId: 'task-1',
    usage: { costUsd: 0, durationMs: 1, tokens: 0 },
  }
  state = completeAxisGuardedTask(
    state,
    worker,
    '2026-07-30T00:00:02.000Z',
  )
  return {
    execution: {
      blockReason: 'feature-disabled',
      checkpointReceipts: [],
      completionEvidence: null,
      detail: 'Axis real file execution is disabled',
      gateResult: null,
      mode: 'safe-write',
      rollbackOutcomes: [],
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'blocked',
      taskId: 'task-1',
      writeReceipts: [],
    },
    runState: state,
  }
}

export function handoff(): AxisPivotContinuationHandoff {
  return {
    action: 'retry',
    createdAt: '2026-07-30T00:00:00.010Z',
    decisionId: 'decision-1',
    executionRevision: 3,
    failureEvidenceId: 'failure-1',
    handoffId: 'continuation-1',
    runId: 'run-1',
    schemaVersion: 1,
    sessionId: 'session-1',
    status: 'pending-guarded-review',
    targetRunId: 'run-1',
  }
}

export function reviewedReceipt() {
  return {
    expectedRevision: 5,
    expiresAt: '2026-07-30T08:01:00.000Z',
    files: [{
      fileKey: '1'.repeat(64),
      filePath: 'src/one.ts',
      projectRelativePath: 'src/one.ts',
      proposedContentSha256: 'f39592393ef0859cb196a52693d2cea00fb2df784b3c04ae54aa7cadb8e562f8',
      state: {
        byteLength: 6,
        contentSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
        fileInstanceSha256: '2'.repeat(64),
        kind: 'exists' as const,
      },
    }],
    issuedAt: '2026-07-30T08:00:00.000Z',
    issuer: 'pivot-main' as const,
    projectId: 'project-1',
    proposalId: 'proposal-1',
    receiptId: 'reviewed-proposal-1',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    signature: '3'.repeat(64),
    taskId: 'task-1',
  }
}

export function reviewedProposalResult(): AxisSafeWriteProposalResult {
  let state = createAxisRunState({
    complexity: {
      confidence: 1,
      policyAdjustments: [],
      reasons: ['One guarded repair'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      riskFlags: [],
      route: 'single-agent',
      schemaVersion: 1,
      score: 1,
      suggestedWorkers: 1,
    },
    dag: {
      createdAt: '2026-07-30T00:00:00.000Z',
      dagId: 'dag-1',
      objective: 'Repair one file',
      schemaVersion: 1,
      tasks: [guardedTask],
    },
    mode: 'shadow',
    objective: 'Repair one file',
    schedule: {
      batches: [['task-1']],
      orderedTaskIds: ['task-1'],
      warnings: [],
    },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{
        detail: 'planned',
        sequence: 1,
        taskId: null,
        timestamp: '2026-07-30T00:00:00.000Z',
        type: 'run-completed',
      }],
      runId: 'run-1',
      sessionId: 'session-1',
      startedAt: '2026-07-30T00:00:00.000Z',
      traceId: 'trace-1',
    },
    usage: {
      costUsd: 0,
      durationMs: 0,
      gateCyclesForFile: 0,
      pivots: 0,
      retriesForTask: 0,
      tokens: 0,
    },
  }, axisBudget(), '2026-07-30T00:00:00.000Z')
  for (let revision = 1; revision < 5; revision += 1) {
    state = recordAxisSafeWriteProposalUsage(
      state,
      guardedTask.id,
      { costUsd: 0, tokens: 1 },
      1,
      `2026-07-30T00:00:0${revision}.000Z`,
    )
  }
  return {
    proposal: {
      createdAt: '2026-07-30T08:00:00.000Z',
      expectedRevision: 5,
      files: [{
        filePath: 'src/one.ts',
        originalContent: 'before',
        originalSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
        originalState: 'existing',
        proposedContent: 'after',
      }],
      proposalId: 'proposal-1',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      usage: { costUsd: 0, tokens: 1 },
    },
    receipt: reviewedReceipt(),
    runState: state,
  }
}
