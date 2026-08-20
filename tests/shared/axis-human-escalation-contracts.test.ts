import { describe, expect, it } from 'vitest'
import {
  AxisHumanEscalationCreateInputSchema,
  AxisHumanEscalationReceiptSchema,
} from '../../src/shared/axis-human-escalation-contracts'
import {
  AxisPivotEscalateActionRequestSchema,
  AxisPivotEscalateActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis Human Escalation contracts', () => {
  it('accepts immutable decision-bound attention evidence', () => {
    expect(AxisHumanEscalationCreateInputSchema.parse(createInput())).toEqual(
      createInput(),
    )
    expect(AxisHumanEscalationReceiptSchema.parse(receiptValue())).toEqual(
      receiptValue(),
    )
  })

  it('rejects unsupported categories, duplicate evidence, and unknown fields', () => {
    expect(() => AxisHumanEscalationCreateInputSchema.parse({
      ...createInput(),
      category: 'minor',
    })).toThrow()
    expect(() => AxisHumanEscalationCreateInputSchema.parse({
      ...createInput(),
      evidenceIds: ['review-1', 'review-1'],
    })).toThrow(/evidence/i)
    expect(() => AxisHumanEscalationReceiptSchema.parse({
      ...receiptValue(),
      authority: 'renderer',
    })).toThrow()
  })

  it('keeps the action request limited to four decision-owned fields', () => {
    const request = {
      decisionId: 'pivot-escalate-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
    }

    expect(AxisPivotEscalateActionRequestSchema.parse(request)).toEqual(request)
    expect(() => AxisPivotEscalateActionRequestSchema.parse({
      ...request,
      reason: 'caller-controlled',
    })).toThrow()
    expect(() => AxisPivotEscalateActionRequestSchema.parse({
      ...request,
      taskId: 'caller-task',
    })).toThrow()
  })

  it('cross-validates action result ownership against escalation evidence', () => {
    const result = actionResult()

    expect(AxisPivotEscalateActionResultSchema.parse(result)).toEqual(result)
    expect(() => AxisPivotEscalateActionResultSchema.parse({
      ...result,
      taskId: 'task-other',
    })).toThrow(/task/i)
    expect(() => AxisPivotEscalateActionResultSchema.parse({
      ...result,
      sessionId: 'session-other',
    })).toThrow(/session|ownership/i)
  })
})

function createInput() {
  return {
    category: 'security' as const,
    decisionId: 'pivot-escalate-1',
    evidenceIds: ['review-1'],
    executionRevision: 5,
    reason: 'A human must assess the security impact',
    runId: 'run-1',
    sessionId: 'session-1',
    summary: 'The review found a security-sensitive conflict',
    taskId: 'inspect',
  }
}

function receiptValue() {
  return {
    ...createInput(),
    escalationId: 'escalation-1',
    openedAt: '2026-07-30T00:00:02.000Z',
    schemaVersion: 1 as const,
    status: 'open' as const,
  }
}

function actionResult() {
  return {
    action: 'escalate' as const,
    authority: 'pivot-main' as const,
    decisionId: 'pivot-escalate-1',
    executionRevision: 5,
    outcome: 'opened' as const,
    receipt: receiptValue(),
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    taskId: 'inspect',
  }
}
