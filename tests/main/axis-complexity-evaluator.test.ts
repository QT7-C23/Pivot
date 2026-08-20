import { describe, expect, it, vi } from 'vitest'
import { AxisComplexityEvaluator } from '../../src/main/services/axis-complexity-evaluator'
import type { AxisPlanningModel } from '../../src/main/services/axis-planning-model'

describe('Axis complexity evaluator', () => {
  it('accepts only a strict model report and preserves measured usage', async () => {
    const assessComplexity = vi.fn(async () => ({
      output: {
        confidence: 0.9,
        reasons: ['Touches main and renderer boundaries'],
        riskFlags: ['cross-module'],
        route: 'multi-agent',
        score: 4,
        suggestedWorkers: 3,
      },
      usage: { costUsd: 0.0008, tokens: 420 },
    }))
    const evaluator = new AxisComplexityEvaluator({ assessComplexity } as Pick<AxisPlanningModel, 'assessComplexity'>)

    const result = await evaluator.evaluate('Implement Axis shadow planning', {
      availableFiles: ['src/main/main.ts'],
      constraints: ['Do not execute tools'],
    })

    expect(result.report).toMatchObject({
      confidence: 0.9,
      requiredGates: ['compile', 'test', 'correctness'],
      requiresHumanReview: false,
      route: 'multi-agent',
      schemaVersion: 1,
      score: 4,
      suggestedWorkers: 3,
    })
    expect(result.usage).toEqual({ costUsd: 0.0008, tokens: 420 })
    expect(assessComplexity).toHaveBeenCalledWith({
      context: { availableFiles: ['src/main/main.ts'], constraints: ['Do not execute tools'] },
      objective: 'Implement Axis shadow planning',
    })
  })

  it('rejects an inconsistent or expanded model response', async () => {
    const evaluator = new AxisComplexityEvaluator({
      assessComplexity: async () => ({
        output: { confidence: 0.9, reasons: ['Simple'], riskFlags: [], route: 'single-agent', score: 1, suggestedWorkers: 2, hidden: true },
        usage: { costUsd: 0, tokens: 10 },
      }),
    })

    await expect(evaluator.evaluate('Small task', { availableFiles: [], constraints: [] })).rejects.toThrow()
  })
})
