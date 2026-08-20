import { describe, expect, it } from 'vitest'
import {
  AxisPivotReplanActionRequestSchema,
  AxisPivotReplanActionResultSchema,
} from '../../src/shared/axis-pivot-action-contracts'

describe('Axis Pivot replan action contracts', () => {
  it('accepts a completed Main-owned replan receipt bound to the execution revision', () => {
    expect(AxisPivotReplanActionResultSchema.parse(validResult())).toMatchObject({
      action: 'replan',
      authority: 'pivot-main',
      executionRevision: 5,
      outcome: 'created',
    })
  })

  it('rejects caller-selected authority fields and mismatched lineage evidence', () => {
    expect(() => AxisPivotReplanActionRequestSchema.parse({
      decisionId: 'pivot-1',
      expectedRevision: 5,
      projectRoot: 'D:\\forged',
      runId: 'run-parent',
      sessionId: 'session-1',
    })).toThrow()
    expect(() => AxisPivotReplanActionRequestSchema.parse({
      action: 'replan',
      decisionId: 'pivot-1',
      expectedRevision: 5,
      runId: 'run-parent',
      sessionId: 'session-1',
    })).toThrow()
    expect(() => AxisPivotReplanActionResultSchema.parse({
      ...validResult(),
      lineage: {
        ...validResult().lineage,
        sourceRevision: 4,
      },
    })).toThrow(/revision/i)
    expect(() => AxisPivotReplanActionResultSchema.parse({
      ...validResult(),
      lineage: {
        ...validResult().lineage,
        status: 'materializing',
      },
    })).toThrow(/completed/i)
  })
})

function validResult() {
  return {
    action: 'replan' as const,
    authority: 'pivot-main' as const,
    decisionId: 'pivot-1',
    executionRevision: 5,
    lineage: {
      attemptId: 'replan-1',
      budget: {
        maxCostUsd: 1,
        maxDurationMs: 60_000,
        maxGateCyclesPerFile: 2,
        maxPivots: 3,
        maxRetriesPerTask: 1,
        maxTokens: 10_000,
        maxWorkers: 2,
      },
      childRunId: 'run-child',
      createdAt: '2026-07-29T00:00:00.000Z',
      error: null,
      fileScope: ['src/main/axis.ts'],
      fileScopeDigest: 'a'.repeat(64),
      generation: 2,
      objective: 'Build Axis state',
      objectiveDigest: 'b'.repeat(64),
      parentRunId: 'run-parent',
      rootRunId: 'run-parent',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      sourceRevision: 5,
      status: 'completed' as const,
      updatedAt: '2026-07-29T00:00:01.000Z',
    },
    outcome: 'created' as const,
    parentRunId: 'run-parent',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
  }
}
