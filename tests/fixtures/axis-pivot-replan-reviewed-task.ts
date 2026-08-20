import type { AxisPivotGuardedContinuationAttempt } from '../../src/shared/axis-pivot-guarded-continuation-contracts'
import type { AxisSafeWriteProposalResult } from '../../src/shared/axis-safe-write-proposal-contracts'
import {
  completeAxisGuardedTask,
  recordAxisSafeWriteProposalUsage,
  startAxisGuardedTask,
} from '../../src/shared/axis-run-state'
import {
  replanChildPlan,
  replanChildState,
  scheduledTaskEvidence,
} from './axis-pivot-replan-task-scheduling'

export function replanChildProposalResult(): AxisSafeWriteProposalResult {
  const task = replanChildPlan().dag!.tasks[0]!
  const runState = recordAxisSafeWriteProposalUsage(
    replanChildState(),
    task.id,
    { costUsd: 0, tokens: 1 },
    1,
    '2026-08-02T01:00:01.000Z',
  )
  return {
    proposal: {
      createdAt: '2026-08-02T01:00:01.000Z',
      expectedRevision: 2,
      files: [{
        filePath: 'src/one.ts',
        originalContent: 'before',
        originalSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
        originalState: 'existing',
        proposedContent: 'after',
      }],
      proposalId: 'proposal-child-1',
      runId: 'run-child-1',
      sessionId: 'session-1',
      taskId: 'child-task-1',
      usage: { costUsd: 0, tokens: 1 },
    },
    receipt: {
      expectedRevision: 2,
      expiresAt: '2026-08-02T01:05:01.000Z',
      files: [{
        fileKey: '1'.repeat(64),
        filePath: 'src/one.ts',
        projectRelativePath: 'src/one.ts',
        proposedContentSha256: 'f39592393ef0859cb196a52693d2cea00fb2df784b3c04ae54aa7cadb8e562f8',
        state: {
          byteLength: 6,
          contentSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
          fileInstanceSha256: '2'.repeat(64),
          kind: 'exists',
        },
      }],
      issuedAt: '2026-08-02T01:00:01.000Z',
      issuer: 'pivot-main',
      projectId: 'project-1',
      proposalId: 'proposal-child-1',
      receiptId: 'receipt-child-1',
      runId: 'run-child-1',
      schemaVersion: 1,
      sessionId: 'session-1',
      signature: '3'.repeat(64),
      taskId: 'child-task-1',
    },
    runState,
  }
}

export function replanChildContinuationAttempt(): AxisPivotGuardedContinuationAttempt {
  const task = replanChildPlan().dag!.tasks[0]!
  let runState = replanChildProposalResult().runState
  runState = startAxisGuardedTask(
    runState,
    task.id,
    task.dependencies,
    '2026-08-02T01:00:02.000Z',
  )
  runState = completeAxisGuardedTask(runState, {
    artifacts: [],
    findings: ['feature-disabled'],
    status: 'failed',
    summary: 'Axis real file execution is disabled',
    taskId: task.id,
    usage: { costUsd: 0, durationMs: 1, tokens: 0 },
  }, '2026-08-02T01:00:03.000Z')
  return {
    action: 'replan',
    attemptId: 'continuation-attempt-child-1',
    createdAt: '2026-08-02T01:00:02.000Z',
    decisionId: 'decision-replan-1',
    error: null,
    guardedResult: {
      execution: {
        blockReason: 'feature-disabled',
        checkpointReceipts: [],
        completionEvidence: null,
        detail: 'Axis real file execution is disabled',
        gateResult: null,
        mode: 'safe-write',
        rollbackOutcomes: [],
        runId: 'run-child-1',
        sessionId: 'session-1',
        status: 'blocked',
        taskId: 'child-task-1',
        writeReceipts: [],
      },
      runState,
    },
    handoffId: 'handoff-replan-1',
    proposalId: 'proposal-child-1',
    requestSha256: '4'.repeat(64),
    reviewedProposalReceiptId: 'receipt-child-1',
    revision: 2,
    schemaVersion: 1,
    sessionId: 'session-1',
    sourceRunId: 'run-parent-1',
    status: 'completed',
    submittedTaskId: 'child-task-1',
    targetRunId: 'run-child-1',
    updatedAt: '2026-08-02T01:00:03.000Z',
  }
}

export function replanReviewedTaskBeginInput() {
  const schedule = scheduledTaskEvidence()
  return {
    childStateRevision: schedule.childStateRevision,
    decisionId: schedule.decisionId,
    handoffId: schedule.handoffId,
    scheduleId: schedule.scheduleId,
    sessionId: schedule.sessionId,
    sourceRunId: schedule.parentRunId,
    submittedTaskId: schedule.taskId,
    targetRunId: schedule.childRunId,
  }
}

export function replanReviewedTaskPreparing() {
  return {
    ...replanReviewedTaskBeginInput(),
    action: 'replan' as const,
    continuationAttempt: null,
    createdAt: '2026-08-02T01:00:00.000Z',
    error: null,
    orchestrationId: 'replan-reviewed-task-1',
    proposalResult: null,
    revision: 1,
    schemaVersion: 1 as const,
    status: 'preparing' as const,
    updatedAt: '2026-08-02T01:00:00.000Z',
  }
}
