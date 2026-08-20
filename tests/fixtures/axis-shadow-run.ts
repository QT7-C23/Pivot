import type { AxisShadowRunResult, BudgetEnvelope } from '../../src/shared/axis-engine-contracts'

export function axisShadowResult(runId = 'run-1', sessionId = 'session-1'): AxisShadowRunResult {
  const startedAt = '2026-07-22T00:00:00.000Z'
  return {
    complexity: { confidence: 1, policyAdjustments: [], reasons: ['Simple'], requiredGates: ['compile', 'test'], requiresHumanReview: false, riskFlags: [], route: 'single-agent', schemaVersion: 1, score: 1, suggestedWorkers: 1 },
    dag: {
      createdAt: startedAt,
      dagId: `dag-${runId}`,
      objective: 'Build Axis state',
      schemaVersion: 1,
      tasks: [{ assignedFiles: [], dependencies: [], estimatedComplexity: 1, id: 'inspect', objective: 'Inspect', requiredGates: ['compile', 'test'], requiresHumanReview: false, requiredTools: ['read'], spawnDepth: 1, title: 'Inspect' }],
    },
    mode: 'shadow',
    objective: 'Build Axis state',
    schedule: { batches: [['inspect']], orderedTaskIds: ['inspect'], warnings: [] },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{ detail: 'done', sequence: 1, taskId: null, timestamp: startedAt, type: 'run-completed' }],
      runId,
      sessionId,
      startedAt,
      traceId: `trace-${runId}`,
    },
    usage: emptyUsage(),
  }
}

export function axisBudget(): BudgetEnvelope {
  return { maxCostUsd: 0.25, maxDurationMs: 120_000, maxGateCyclesPerFile: 2, maxPivots: 0, maxRetriesPerTask: 0, maxTokens: 20_000, maxWorkers: 4 }
}

export function emptyUsage() {
  return { costUsd: 0, durationMs: 0, gateCyclesForFile: 0, pivots: 0, retriesForTask: 0, tokens: 0 }
}
