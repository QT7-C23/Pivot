import { describe, expect, it } from 'vitest'
import {
  AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS,
  AxisGuardedSafeWriteFeatureStateSchema,
  AxisGuardedSafeWriteSubmissionSchema,
  AxisGuardedSafeWriteSubmissionResultSchema,
} from '../../src/shared/axis-guarded-safe-write-contracts'
import {
  completeAxisGuardedTask,
  createAxisRunState,
  startAxisGuardedTask,
} from '../../src/shared/axis-run-state'
import {
  AxisGuardedSafeWriteCompletionEvidenceSchema,
  AxisGuardedSafeWriteResultSchema,
} from '../../src/shared/axis-engine-contracts'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'
import { axisReviewedProposalReceipt } from '../fixtures/axis-reviewed-proposal'

describe('Axis guarded safe-write submission contracts', () => {
  const validRequest = {
    expectedRevision: 1,
    reviewedProposalReceipt: axisReviewedProposalReceipt(),
    runId: 'run-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    writes: [{ content: 'after', filePath: 'src/one.ts' }],
  }

  it('strictly describes whether guarded execution is available to the Renderer', () => {
    expect(AxisGuardedSafeWriteFeatureStateSchema.parse({
      enabled: false,
      reason: 'disabled',
    })).toEqual({ enabled: false, reason: 'disabled' })
    expect(AxisGuardedSafeWriteFeatureStateSchema.parse({
      enabled: true,
      reason: null,
    })).toEqual({ enabled: true, reason: null })
    expect(() => AxisGuardedSafeWriteFeatureStateSchema.parse({
      enabled: true,
      reason: 'disabled',
    })).toThrow()
    expect(() => AxisGuardedSafeWriteFeatureStateSchema.parse({
      enabled: false,
      reason: 'disabled',
      projectRoot: 'D:\\forged',
    })).toThrow()
  })

  it('accepts only the narrow identifiers and bounded write payload', () => {
    expect(AxisGuardedSafeWriteSubmissionSchema.parse(validRequest)).toEqual(validRequest)
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...validRequest,
      projectRoot: 'C:\\forged',
    })).toThrow()
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...validRequest,
      task: { id: 'forged-task' },
    })).toThrow()
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...validRequest,
      grantedTools: ['fs.safeWrite'],
    })).toThrow()
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...validRequest,
      expectedRevision: 0,
    })).toThrow()
  })

  it('rejects duplicate files and content beyond the aggregate hard limit', () => {
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...validRequest,
      writes: [
        { content: 'one', filePath: 'src/one.ts' },
        { content: 'two', filePath: 'src/one.ts' },
      ],
    })).toThrow(/unique/i)
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...validRequest,
      writes: [{
        content: 'x'.repeat(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS + 1),
        filePath: 'src/one.ts',
      }],
    })).toThrow(/content/i)
  })

  it('binds durable completion to Main transaction, checkpoint, Gate, and exact write evidence', () => {
    const evidence = completionEvidence()

    expect(AxisGuardedSafeWriteCompletionEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(() => AxisGuardedSafeWriteCompletionEvidenceSchema.parse({
      ...evidence,
      projectRoot: 'C:\\forged',
    })).toThrow()
    expect(() => AxisGuardedSafeWriteCompletionEvidenceSchema.parse({
      ...evidence,
      writes: [...evidence.writes, evidence.writes[0]],
    })).toThrow(/unique/i)
    expect(() => AxisGuardedSafeWriteCompletionEvidenceSchema.parse({
      ...evidence,
      transactionRevision: 2,
    })).toThrow()
  })

  it('requires completion evidence only for completed results and cross-checks every evidence set', () => {
    const evidence = completionEvidence()
    const checkpointReceipt = evidence.checkpointReceipts[0]
    const gateResult = {
      cycle: 1,
      evidenceIds: evidence.gateEvidenceIds,
      gates: [{
        durationMs: 1,
        evidence: ['compile passed'],
        gate: 'compile' as const,
        status: 'passed' as const,
        taskId: evidence.taskId,
      }],
      runId: evidence.runId,
      schemaVersion: 1 as const,
      sessionId: evidence.sessionId,
      status: 'passed' as const,
      taskId: evidence.taskId,
    }
    const writeReceipt = {
      checkpointReceipt,
      contentSha256: evidence.writes[0].contentSha256,
      envelopeId: evidence.writes[0].envelopeId,
      filePath: evidence.writes[0].filePath,
      mode: 'safe-write' as const,
      rollbackOwner: {
        kind: 'axis-run' as const,
        runId: evidence.runId,
        sessionId: evidence.sessionId,
      },
      runId: evidence.runId,
      sessionId: evidence.sessionId,
      sizeBytes: 5,
      status: 'written' as const,
      taskId: evidence.taskId,
      timestamp: '2026-07-29T00:00:02.000Z',
      toolName: 'fs.safeWrite',
    }
    const result = {
      blockReason: null,
      checkpointReceipts: [checkpointReceipt],
      completionEvidence: evidence,
      detail: 'Completed',
      gateResult,
      mode: 'safe-write' as const,
      rollbackOutcomes: [],
      runId: evidence.runId,
      sessionId: evidence.sessionId,
      status: 'completed' as const,
      taskId: evidence.taskId,
      writeReceipts: [writeReceipt],
    }

    expect(AxisGuardedSafeWriteResultSchema.parse(result)).toEqual(result)
    expect(() => AxisGuardedSafeWriteResultSchema.parse({
      ...result,
      completionEvidence: {
        ...evidence,
        gateEvidenceIds: ['other-gate-evidence'],
      },
    })).toThrow(/completion/i)
    expect(() => AxisGuardedSafeWriteResultSchema.parse({
      ...result,
      completionEvidence: null,
    })).toThrow(/completion/i)
    expect(() => AxisGuardedSafeWriteResultSchema.parse({
      ...result,
      completionEvidence: evidence,
      status: 'failed-rolled-back',
    })).toThrow(/completion/i)
  })

  it('strictly validates execution and authoritative state ownership together', () => {
    const initial = createAxisRunState(
      axisShadowResult(),
      axisBudget(),
      '2026-07-29T00:00:00.000Z',
    )
    const claimed = startAxisGuardedTask(
      initial,
      'inspect',
      [],
      '2026-07-29T00:00:01.000Z',
    )
    const runState = completeAxisGuardedTask(claimed, {
      artifacts: [],
      findings: ['permission-denied'],
      status: 'failed',
      summary: 'Permission denied',
      taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 1, tokens: 0 },
    }, '2026-07-29T00:00:02.000Z')
    const result = {
      execution: {
        blockReason: 'permission-denied',
        checkpointReceipts: [],
        completionEvidence: null,
        detail: 'Permission denied',
        gateResult: null,
        mode: 'safe-write',
        rollbackOutcomes: [],
        runId: 'run-1',
        sessionId: 'session-1',
        status: 'blocked',
        taskId: 'inspect',
        writeReceipts: [],
      },
      runState,
    }

    expect(AxisGuardedSafeWriteSubmissionResultSchema.parse(result)).toEqual(result)
    expect(() => AxisGuardedSafeWriteSubmissionResultSchema.parse({
      ...result,
      execution: { ...result.execution, taskId: 'forged-task' },
    })).toThrow(/ownership/i)
    expect(() => AxisGuardedSafeWriteSubmissionResultSchema.parse({
      ...result,
      debug: { databasePath: 'C:\\forged' },
    })).toThrow()
  })
})

function completionEvidence() {
  return {
    authority: 'pivot-main' as const,
    checkpointReceipts: [{
      checkpointId: 'checkpoint-1',
      filePath: 'src/one.ts',
      priorState: 'existing-file' as const,
      rollbackAction: 'restore-checkpoint' as const,
    }],
    completedAt: '2026-07-29T00:00:03.000Z',
    gateEvidenceIds: ['gate-evidence-1'],
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    status: 'completed' as const,
    taskId: 'task-1',
    transactionId: 'transaction-1',
    transactionRevision: 3,
    writes: [{
      contentSha256: '1'.repeat(64),
      envelopeId: 'envelope-1',
      filePath: 'src/one.ts',
    }],
  }
}
