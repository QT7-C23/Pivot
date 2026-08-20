import { describe, expect, it } from 'vitest'
import {
  BudgetEnvelopeSchema,
  ComplexityReportSchema,
  EngineTraceSchema,
  AxisExecutionAuthorityEnvelopeSchema,
  AxisExecutionTransactionSchema,
  AxisTaskSchema,
  TaskDagSchema,
} from '../../src/shared/axis-engine-contracts'

describe('Pivot Axis Engine hard contracts', () => {
  it('accepts a bounded alpha contract set', () => {
    expect(ComplexityReportSchema.parse({
      confidence: 0.9,
      policyAdjustments: [],
      reasons: ['Touches independent renderer and main-process boundaries'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      riskFlags: ['cross-module'],
      route: 'multi-agent',
      schemaVersion: 1,
      score: 4,
      suggestedWorkers: 3,
    }).route).toBe('multi-agent')

    expect(BudgetEnvelopeSchema.parse({
      maxCostUsd: 2,
      maxDurationMs: 120_000,
      maxGateCyclesPerFile: 3,
      maxPivots: 5,
      maxRetriesPerTask: 2,
      maxTokens: 100_000,
      maxWorkers: 4,
    }).maxWorkers).toBe(4)
  })

  it('rejects recursive workers and unknown protocol fields', () => {
    const dag = validDag()
    dag.tasks[0]!.spawnDepth = 2
    expect(() => TaskDagSchema.parse(dag)).toThrow()
    expect(() => ComplexityReportSchema.parse({
      confidence: 0.9, policyAdjustments: [], reasons: ['simple'], requiredGates: ['compile', 'test'],
      requiresHumanReview: false, riskFlags: [], route: 'single-agent', schemaVersion: 1, score: 1,
      suggestedWorkers: 1, hidden: true,
    })).toThrow()
  })

  it('requires code-owned Gate policy on every authoritative task', () => {
    const task = validDag().tasks[0]!
    expect(() => AxisTaskSchema.parse({
      ...task,
      requiredGates: ['test', 'compile'],
      requiresHumanReview: false,
    })).toThrow(/begin/i)
    expect(() => AxisTaskSchema.parse({
      ...task,
      requiredGates: ['compile', 'test', 'test'],
      requiresHumanReview: false,
    })).toThrow(/unique/i)
  })

  it('requires ordered trace events with explicit task references', () => {
    expect(() => EngineTraceSchema.parse({
      events: [
        { detail: 'started', sequence: 2, taskId: null, timestamp: '2026-07-22T00:00:00.000Z', type: 'run-started' },
        { detail: 'scheduled', sequence: 1, taskId: 'task-a', timestamp: '2026-07-22T00:00:01.000Z', type: 'task-scheduled' },
      ],
      runId: 'run-1',
      sessionId: 'session-1',
      startedAt: '2026-07-22T00:00:00.000Z',
      traceId: 'trace-1',
    })).toThrow(/sequence/i)
  })

  it('cannot claim a complete rollback when physical evidence contains a failure', () => {
    expect(() => AxisExecutionTransactionSchema.parse({
      checkpointReceipts: [{ checkpointId: null, filePath: 'D:\\project\\new.ts', priorState: 'new-file', rollbackAction: 'delete-created-file' }],
      createdAt: '2026-07-22T00:00:00.000Z',
      projectRoot: 'D:\\project',
      revision: 5,
      rollbackOutcomes: [{ action: 'delete-created-file', detail: 'delete failed', filePath: 'D:\\project\\new.ts', status: 'failed' }],
      runId: 'run-1', schemaVersion: 1, sessionId: 'session-1', status: 'rolled-back', taskId: 'task-1',
      transactionId: 'transaction-1', updatedAt: '2026-07-22T00:00:01.000Z',
    })).toThrow(/failed outcomes/i)
  })

  it('requires safe-write authority to bind matching Lease and Fingerprint evidence', () => {
    const envelope = validSafeWriteEnvelope()
    expect(AxisExecutionAuthorityEnvelopeSchema.parse(envelope)).toMatchObject({
      fileFingerprintEvidence: [{ fileKey: 'a'.repeat(64) }],
      fileLeaseEvidence: [{ leaseId: 'lease-1', version: 1 }],
      mode: 'safe-write',
      projectId: 'project-1',
    })
    expect(() => AxisExecutionAuthorityEnvelopeSchema.parse({
      ...envelope,
      fileFingerprintEvidence: [],
    })).toThrow(/fingerprint/i)
    expect(() => AxisExecutionAuthorityEnvelopeSchema.parse({
      ...envelope,
      fileLeaseEvidence: [{
        ...envelope.fileLeaseEvidence[0],
        taskId: 'task-other',
      }],
    })).toThrow(/ownership/i)
  })
})

function validDag() {
  return {
    createdAt: '2026-07-22T00:00:00.000Z',
    dagId: 'dag-1',
    objective: 'Build the engine foundation',
    schemaVersion: 1 as const,
    tasks: [{
      assignedFiles: ['src/shared/axis-engine-contracts.ts'],
      dependencies: [],
      estimatedComplexity: 2,
      id: 'task-a',
      objective: 'Define contracts',
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      requiredTools: ['read', 'write'],
      spawnDepth: 1,
      title: 'Contracts',
    }],
  }
}

function validSafeWriteEnvelope() {
  const capturedAt = '2026-07-28T00:00:00.000Z'
  const expiresAt = '2026-07-28T00:01:00.000Z'
  return {
    allowedFiles: ['D:\\project\\src\\app.ts'],
    allowedTools: ['fs.safeWrite'],
    checkpointReceipts: [{
      checkpointId: 'checkpoint-1',
      filePath: 'D:\\project\\src\\app.ts',
      priorState: 'existing-file' as const,
      rollbackAction: 'restore-checkpoint' as const,
    }],
    envelopeId: 'authority-1',
    expiresAt,
    fileFingerprintEvidence: [{
      capturedAt,
      evidenceId: 'fingerprint-1',
      expiresAt,
      fileKey: 'a'.repeat(64),
      projectId: 'project-1',
      projectRelativePath: 'src/app.ts',
      proof: 'p'.repeat(43),
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      state: {
        byteLength: 6,
        contentSha256: 'b'.repeat(64),
        fileInstanceSha256: 'c'.repeat(64),
        kind: 'exists' as const,
      },
      taskId: 'task-1',
    }],
    fileLeaseEvidence: [{
      acquiredAt: capturedAt,
      expiresAt,
      fileKey: 'a'.repeat(64),
      leaseId: 'lease-1',
      projectId: 'project-1',
      projectRelativePath: 'src/app.ts',
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      status: 'active' as const,
      taskId: 'task-1',
      updatedAt: capturedAt,
      version: 1,
    }],
    issuedAt: capturedAt,
    issuer: 'pivot-main' as const,
    mode: 'safe-write' as const,
    projectId: 'project-1',
    projectRoot: 'D:\\project',
    rollbackOwner: { kind: 'axis-run' as const, runId: 'run-1', sessionId: 'session-1' },
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    signature: 'd'.repeat(64),
    taskId: 'task-1',
  }
}
