import { describe, expect, it } from 'vitest'
import {
  AxisPivotDiscardActionRequestSchema,
  AxisPivotDiscardActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'
import {
  AxisWorkerDiscardReceiptSchema,
} from '../../src/shared/axis-worker-discard-contracts'

describe('Axis Worker discard contracts', () => {
  it('accepts immutable decision-bound failed-attempt disposition evidence', () => {
    const receipt = AxisWorkerDiscardReceiptSchema.parse(receiptValue())

    expect(receipt.status).toBe('discarded')
    expect(receipt.sourceWorkerId).toBe('worker-1')
  })

  it('rejects malformed status, identifiers, and unknown authority fields', () => {
    expect(() => AxisWorkerDiscardReceiptSchema.parse({
      ...receiptValue(),
      status: 'rebuilt',
    })).toThrow()
    expect(() => AxisWorkerDiscardReceiptSchema.parse({
      ...receiptValue(),
      sourceAttempt: 0,
    })).toThrow()
    expect(() => AxisWorkerDiscardReceiptSchema.parse({
      ...receiptValue(),
      authority: 'forged',
    })).toThrow()
  })

  it('keeps the action request limited to four decision-owned fields', () => {
    const request = {
      decisionId: 'pivot-discard-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
    }

    expect(AxisPivotDiscardActionRequestSchema.parse(request)).toEqual(request)
    expect(() => AxisPivotDiscardActionRequestSchema.parse({
      ...request,
      taskId: 'caller-task',
    })).toThrow()
    expect(() => AxisPivotDiscardActionRequestSchema.parse({
      ...request,
      workerId: 'caller-worker',
    })).toThrow()
  })

  it('cross-validates action result ownership against discard evidence', () => {
    const result = actionResult()

    expect(AxisPivotDiscardActionResultSchema.parse(result)).toEqual(result)
    expect(() => AxisPivotDiscardActionResultSchema.parse({
      ...result,
      taskId: 'task-other',
    })).toThrow(/task/i)
    expect(() => AxisPivotDiscardActionResultSchema.parse({
      ...result,
      workerId: 'worker-other',
    })).toThrow(/worker/i)
  })
})

function receiptValue() {
  return {
    createdAt: '2026-07-30T00:00:02.000Z',
    decisionId: 'pivot-discard-1',
    discardId: 'discard-1',
    executionRevision: 5,
    reason: 'Discard the failed Worker attempt',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    sourceAttempt: 1,
    sourceAttemptId: 'attempt-1',
    sourceWorkerId: 'worker-1',
    status: 'discarded' as const,
    taskId: 'inspect',
  }
}

function actionResult() {
  return {
    action: 'discard' as const,
    authority: 'pivot-main' as const,
    decisionId: 'pivot-discard-1',
    executionRevision: 5,
    outcome: 'discarded' as const,
    receipt: receiptValue(),
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    taskId: 'inspect',
    workerId: 'worker-1',
  }
}
