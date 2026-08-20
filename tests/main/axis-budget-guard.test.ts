import { describe, expect, it } from 'vitest'
import { evaluateAxisBudget } from '../../src/main/services/axis-budget-guard'
import type { BudgetEnvelope, EngineBudgetUsage } from '../../src/shared/axis-engine-contracts'

const envelope: BudgetEnvelope = {
  maxCostUsd: 1,
  maxDurationMs: 60_000,
  maxGateCyclesPerFile: 3,
  maxPivots: 5,
  maxRetriesPerTask: 2,
  maxTokens: 10_000,
  maxWorkers: 4,
}

describe('Axis Engine budget guard', () => {
  it('allows work inside every hard limit', () => {
    expect(evaluateAxisBudget(envelope, usage()).allowed).toBe(true)
  })

  it.each([
    ['token-limit', { tokens: 10_001 }],
    ['cost-limit', { costUsd: 1.01 }],
    ['time-limit', { durationMs: 60_001 }],
    ['retry-limit', { retriesForTask: 3 }],
    ['gate-cycle-limit', { gateCyclesForFile: 4 }],
    ['pivot-limit', { pivots: 6 }],
  ] as const)('stops with %s', (reason, patch) => {
    expect(evaluateAxisBudget(envelope, usage(patch))).toEqual({ allowed: false, stopReason: reason })
  })
})

function usage(patch: Partial<EngineBudgetUsage> = {}): EngineBudgetUsage {
  return { costUsd: 0.2, durationMs: 10_000, gateCyclesForFile: 1, pivots: 0, retriesForTask: 0, tokens: 2_000, ...patch }
}
