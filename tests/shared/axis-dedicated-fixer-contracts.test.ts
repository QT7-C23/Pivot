import { describe, expect, it } from 'vitest'
import {
  AxisDedicatedFixerAssignmentSchema,
  AxisDedicatedFixerIdentitySchema,
} from '../../src/shared/axis-dedicated-fixer-contracts'
import {
  AxisPivotDedicatedFixerActionRequestSchema,
  AxisPivotDedicatedFixerActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis dedicated Fixer contracts', () => {
  it('accepts a code-owned security Fixer identity and different source Worker', () => {
    const fixer = AxisDedicatedFixerIdentitySchema.parse(securityFixer())
    const assignment = AxisDedicatedFixerAssignmentSchema.parse({
      ...assignmentInput(),
      assignmentId: 'fixer-assignment-1',
      createdAt: '2026-07-29T00:00:02.000Z',
      fixer,
      schemaVersion: 1,
      status: 'assigned',
    })

    expect(assignment.fixer.fixerId).not.toBe(assignment.sourceWorkerId)
    expect(assignment.fixer.specialty).toBe('security')
  })

  it('rejects same-Worker assignment, wrong specialty, and unknown authority fields', () => {
    expect(() => AxisDedicatedFixerAssignmentSchema.parse({
      ...assignmentInput(),
      assignmentId: 'fixer-assignment-1',
      createdAt: '2026-07-29T00:00:02.000Z',
      fixer: { ...securityFixer(), fixerId: 'worker-1' },
      schemaVersion: 1,
      status: 'assigned',
    })).toThrow(/different|source worker/i)
    expect(() => AxisDedicatedFixerIdentitySchema.parse({
      ...securityFixer(),
      specialty: 'general',
    })).toThrow()
    expect(() => AxisDedicatedFixerAssignmentSchema.parse({
      ...assignmentInput(),
      assignmentId: 'fixer-assignment-1',
      authority: 'forged',
      createdAt: '2026-07-29T00:00:02.000Z',
      fixer: securityFixer(),
      schemaVersion: 1,
      status: 'assigned',
    })).toThrow()
  })

  it('keeps the action request limited to four decision-owned fields', () => {
    const request = {
      decisionId: 'pivot-security-1',
      expectedRevision: 5,
      runId: 'run-1',
      sessionId: 'session-1',
    }
    expect(AxisPivotDedicatedFixerActionRequestSchema.parse(request)).toEqual(
      request,
    )
    expect(() => AxisPivotDedicatedFixerActionRequestSchema.parse({
      ...request,
      fixerId: 'caller-fixer',
    })).toThrow()
    expect(() => AxisPivotDedicatedFixerActionRequestSchema.parse({
      ...request,
      issue: 'caller issue',
    })).toThrow()
  })

  it('cross-validates action result ownership against assignment evidence', () => {
    const result = actionResult()
    expect(AxisPivotDedicatedFixerActionResultSchema.parse(result)).toEqual(
      result,
    )
    expect(() => AxisPivotDedicatedFixerActionResultSchema.parse({
      ...result,
      fixerId: 'fixer-other',
    })).toThrow(/fixer/i)
    expect(() => AxisPivotDedicatedFixerActionResultSchema.parse({
      ...result,
      taskId: 'task-other',
    })).toThrow(/task/i)
  })
})

function securityFixer() {
  return {
    fixerId: 'security-fixer',
    role: 'security-fixer' as const,
    schemaVersion: 1 as const,
    specialty: 'security' as const,
  }
}

function assignmentInput() {
  return {
    decisionId: 'pivot-security-1',
    executionRevision: 5,
    issue: 'Repair the security finding',
    runId: 'run-1',
    sessionId: 'session-1',
    sourceAttempt: 1,
    sourceAttemptId: 'attempt-1',
    sourceWorkerId: 'worker-1',
    taskId: 'inspect',
  }
}

function actionResult() {
  return {
    action: 'dedicated-fixer' as const,
    assignment: {
      ...assignmentInput(),
      assignmentId: 'fixer-assignment-1',
      createdAt: '2026-07-29T00:00:02.000Z',
      fixer: securityFixer(),
      schemaVersion: 1 as const,
      status: 'assigned' as const,
    },
    authority: 'pivot-main' as const,
    decisionId: 'pivot-security-1',
    executionRevision: 5,
    fixerId: 'security-fixer',
    outcome: 'assigned' as const,
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    taskId: 'inspect',
  }
}
