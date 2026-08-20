import { describe, expect, it, vi } from 'vitest'
import type { AxisRunState, WorkerResult } from '../../src/shared/axis-engine-contracts'
import type { AxisPivotReplanTaskSchedule } from '../../src/shared/axis-pivot-replan-task-scheduling-contracts'
import { AxisPivotReplanReviewedTaskOrchestrationSchema } from '../../src/shared/axis-pivot-replan-reviewed-task-contracts'
import { AxisPivotReplanRunDriver } from '../../src/main/services/axis-pivot-replan-run-driver'
import {
  completeAxisGuardedTask,
  recordAxisSafeWriteProposalUsage,
  startAxisGuardedTask,
} from '../../src/shared/axis-run-state'
import {
  replanChildContinuationAttempt,
  replanChildProposalResult,
  replanReviewedTaskPreparing,
} from '../fixtures/axis-pivot-replan-reviewed-task'
import {
  replanChildPlan,
  replanChildState,
  scheduledTaskEvidence,
} from '../fixtures/axis-pivot-replan-task-scheduling'

describe('Axis Pivot replan Run driver', () => {
  it('serially advances every dependency-ready child task to completion', async () => {
    const firstProposalState = proposalState(replanChildState(), 'child-task-1', 1)
    const firstState = completeTask(firstProposalState, 0)
    const secondProposalState = proposalState(firstState, 'child-task-2', 2)
    const finalState = completeTask(secondProposalState, 1)
    const schedules: AxisPivotReplanTaskSchedule[] = [
      scheduledTaskEvidence(),
      { ...scheduledTaskEvidence(), childStateRevision: firstState.revision,
        dependencyTaskIds: ['child-task-1'], scheduleId: 'replan-schedule-2',
        taskId: 'child-task-2' },
    ]
    const firstOrchestration = completedOrchestration(
      schedules[0]!, firstProposalState, firstState, 'orchestration-1', 'src/one.ts',
    )
    const secondOrchestration = completedOrchestration(
      schedules[1]!, secondProposalState, finalState, 'orchestration-2', 'src/two.ts',
    )
    expect(firstOrchestration.proposalResult.proposal).toMatchObject({
      expectedRevision: schedules[0]!.childStateRevision + 1,
      runId: schedules[0]!.childRunId,
      sessionId: schedules[0]!.sessionId,
      taskId: schedules[0]!.taskId,
    })
    expect({
      childStateRevision: secondOrchestration.childStateRevision,
      expectedRevision: secondOrchestration.proposalResult.proposal.expectedRevision,
      proposalRunId: secondOrchestration.proposalResult.proposal.runId,
      proposalSessionId: secondOrchestration.proposalResult.proposal.sessionId,
      proposalTaskId: secondOrchestration.proposalResult.proposal.taskId,
      submittedTaskId: secondOrchestration.submittedTaskId,
      targetRunId: secondOrchestration.targetRunId,
    }).toEqual({
      childStateRevision: schedules[1]!.childStateRevision,
      expectedRevision: schedules[1]!.childStateRevision + 1,
      proposalRunId: schedules[1]!.childRunId,
      proposalSessionId: schedules[1]!.sessionId,
      proposalTaskId: schedules[1]!.taskId,
      submittedTaskId: schedules[1]!.taskId,
      targetRunId: schedules[1]!.childRunId,
    })
    expect(() => AxisPivotReplanReviewedTaskOrchestrationSchema.parse(firstOrchestration)).not.toThrow()
    expect(() => AxisPivotReplanReviewedTaskOrchestrationSchema.parse(secondOrchestration)).not.toThrow()
    const orchestrate = vi.fn()
      .mockResolvedValueOnce(firstOrchestration)
      .mockResolvedValueOnce(secondOrchestration)
    const schedule = vi.fn()
      .mockReturnValueOnce(schedules[0])
      .mockReturnValueOnce(schedules[1])
    const driver = new AxisPivotReplanRunDriver({
      results: memoryResults(), reviewedTasks: { orchestrate }, scheduler: { schedule },
    })

    await expect(driver.drive({ decisionId: 'decision-replan-1' })).resolves.toMatchObject({
      completedTaskIds: ['child-task-1', 'child-task-2'],
      finalStateRevision: finalState.revision,
      scheduleIds: ['replan-schedule-1', 'replan-schedule-2'],
      status: 'completed',
    })
    expect(schedule).toHaveBeenCalledTimes(2)
    expect(orchestrate).toHaveBeenNthCalledWith(2, { scheduleId: 'replan-schedule-2' })
  })

  it('stops after an authoritative blocked Guarded result', async () => {
    const schedule = scheduledTaskEvidence()
    const orchestration = {
      ...replanReviewedTaskPreparing(),
      continuationAttempt: replanChildContinuationAttempt(),
      orchestrationId: 'orchestration-blocked',
      proposalResult: replanChildProposalResult(),
      revision: 3, status: 'completed' as const,
      updatedAt: '2026-08-02T01:00:03.000Z',
    }
    const scheduler = { schedule: vi.fn(() => schedule) }
    const reviewedTasks = { orchestrate: vi.fn(async () => orchestration) }
    const driver = new AxisPivotReplanRunDriver({
      results: memoryResults(), reviewedTasks, scheduler,
    })

    await expect(driver.drive({ decisionId: 'decision-replan-1' })).resolves.toMatchObject({
      completedTaskIds: [], failureReason: 'Axis real file execution is disabled',
      status: 'failed',
    })
    expect(scheduler.schedule).toHaveBeenCalledOnce()
    expect(reviewedTasks.orchestrate).toHaveBeenCalledOnce()
  })
})

function memoryResults() {
  let value: import('../../src/shared/axis-pivot-replan-run-driver-contracts').AxisPivotReplanRunDriveResult | null = null
  return {
    find: () => value,
    save: (result: NonNullable<typeof value>) => (value = result),
  }
}

function completedOrchestration(
  schedule: AxisPivotReplanTaskSchedule,
  proposalState: AxisRunState,
  runState: AxisRunState,
  orchestrationId: string,
  filePath: string,
) {
  const attempt = replanChildContinuationAttempt()
  const proposal = replanChildProposalResult()
  const proposalId = `proposal-${schedule.taskId}`
  const receiptId = `receipt-${schedule.taskId}`
  return {
    ...replanReviewedTaskPreparing(),
    childStateRevision: schedule.childStateRevision,
    continuationAttempt: {
      ...attempt, attemptId: `attempt-${schedule.taskId}`, guardedResult: {
        execution: completedExecution(schedule.taskId, filePath),
        runState,
      }, proposalId,
      reviewedProposalReceiptId: receiptId,
      submittedTaskId: schedule.taskId,
    },
    orchestrationId,
    proposalResult: {
      proposal: { ...proposal.proposal,
        expectedRevision: proposalState.revision,
        files: proposal.proposal.files.map((file) => ({ ...file, filePath })),
        proposalId, taskId: schedule.taskId },
      receipt: { ...proposal.receipt,
        expectedRevision: proposalState.revision,
        files: proposal.receipt.files.map((file) => ({
          ...file, filePath, projectRelativePath: filePath,
        })),
        proposalId, receiptId, taskId: schedule.taskId },
      runState: proposalState,
    },
    revision: 3, scheduleId: schedule.scheduleId, status: 'completed' as const,
    submittedTaskId: schedule.taskId, updatedAt: '2026-08-02T01:00:04.000Z',
  }
}

function proposalState(state: AxisRunState, taskId: string, offset: number): AxisRunState {
  return recordAxisSafeWriteProposalUsage(
    state, taskId, { costUsd: 0, tokens: 1 }, 1,
    `2026-08-02T01:00:0${offset}.000Z`,
  )
}

function completeTask(state: AxisRunState, taskIndex: number): AxisRunState {
  const task = replanChildPlan().dag!.tasks[taskIndex]!
  const started = startAxisGuardedTask(state, task.id, task.dependencies, '2026-08-02T01:00:03.000Z')
  const result: WorkerResult = { artifacts: [], findings: [], status: 'completed',
    summary: 'Second repair completed', taskId: task.id,
    usage: { costUsd: 0, durationMs: 1, tokens: 0 } }
  return completeAxisGuardedTask(started, result, '2026-08-02T01:00:04.000Z')
}

function completedExecution(taskId: string, filePath: string) {
  const checkpointReceipt = {
    checkpointId: `checkpoint-${taskId}`, filePath,
    priorState: 'existing-file' as const, rollbackAction: 'restore-checkpoint' as const,
  }
  const write = {
    checkpointReceipt, contentSha256: 'a'.repeat(64),
    envelopeId: `envelope-${taskId}`, filePath, mode: 'safe-write' as const,
    rollbackOwner: { kind: 'axis-run' as const, runId: 'run-child-1', sessionId: 'session-1' },
    runId: 'run-child-1', sessionId: 'session-1', sizeBytes: 5,
    status: 'written' as const, taskId, timestamp: '2026-08-02T01:00:04.000Z',
    toolName: 'fs.safeWrite',
  }
  const gateResult = {
    cycle: 1, evidenceIds: [`gate-${taskId}`],
    gates: [{ durationMs: 1, evidence: ['passed'], gate: 'compile' as const,
      status: 'passed' as const, taskId }],
    runId: 'run-child-1', schemaVersion: 1 as const, sessionId: 'session-1',
    status: 'passed' as const, taskId,
  }
  return {
    blockReason: null, checkpointReceipts: [checkpointReceipt],
    completionEvidence: {
      authority: 'pivot-main' as const, checkpointReceipts: [checkpointReceipt],
      completedAt: '2026-08-02T01:00:04.000Z', gateEvidenceIds: gateResult.evidenceIds,
      runId: 'run-child-1', schemaVersion: 1 as const, sessionId: 'session-1',
      status: 'completed' as const, taskId, transactionId: `transaction-${taskId}`,
      transactionRevision: 3,
      writes: [{ contentSha256: write.contentSha256, envelopeId: write.envelopeId, filePath }],
    },
    detail: 'completed', gateResult, mode: 'safe-write' as const,
    rollbackOutcomes: [], runId: 'run-child-1', sessionId: 'session-1',
    status: 'completed' as const, taskId, writeReceipts: [write],
  }
}
