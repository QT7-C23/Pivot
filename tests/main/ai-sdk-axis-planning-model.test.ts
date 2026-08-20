import { describe, expect, it, vi } from 'vitest'
import { AiSdkAxisPlanningModel } from '../../src/main/services/ai-sdk-axis-planning-model'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1', hasApiKey: true, id: 'provider-1', isActive: true,
  kind: 'custom', label: 'Private model', model: 'reasoner', updatedAt: '',
}

describe('AI SDK Axis planning model', () => {
  it('generates strict complexity and DAG objects without exposing tools or credentials', async () => {
    const runStructured = vi.fn()
      .mockResolvedValueOnce({ inputTokens: 100, output: { confidence: 0.9, reasons: ['Cross-module'], riskFlags: ['cross-module'], route: 'multi-agent', score: 4, suggestedWorkers: 2 }, outputTokens: 20 })
      .mockResolvedValueOnce({
        inputTokens: 200,
        output: {
          createdAt: '2026-07-22T00:00:00.000Z', dagId: 'dag-1', objective: 'Build Axis', schemaVersion: 1,
          tasks: [
            { assignedFiles: [], dependencies: [], estimatedComplexity: 1, id: 'inspect', objective: 'Inspect', requiredTools: ['read'], spawnDepth: 1, title: 'Inspect' },
            { assignedFiles: ['src/a.ts'], dependencies: ['inspect'], estimatedComplexity: 3, id: 'build', objective: 'Build', requiredTools: ['write'], spawnDepth: 1, title: 'Build' },
          ],
        },
        outputTokens: 80,
      })
    const model = new AiSdkAxisPlanningModel(provider, 'sk-secret', {
      pricing: { inputUsdPerMillion: 10, outputUsdPerMillion: 20 },
      runStructured,
    })
    const context = { availableFiles: ['src/a.ts'], constraints: ['Planning only'] }

    const complexity = await model.assessComplexity({ context, objective: 'Build Axis' })
    const decomposition = await model.decomposeTask({ complexity: complexity.output as never, context, objective: 'Build Axis' })

    expect(complexity.usage).toEqual({ costUsd: 0.0014, tokens: 120 })
    expect(decomposition.usage).toEqual({ costUsd: 0.0036, tokens: 280 })
    const prompts = runStructured.mock.calls.map((call) => call[0].prompt as string)
    expect(prompts.join('\n')).toContain('<objective>"Build Axis"</objective>')
    expect(prompts.join('\n')).toContain('Never execute tools')
    expect(prompts.join('\n')).not.toContain('sk-secret')
  })

  it('uses a conservative price ceiling when provider-specific pricing is unavailable', async () => {
    const model = new AiSdkAxisPlanningModel(provider, 'secret', {
      runStructured: async () => ({
        inputTokens: 1_000,
        output: { confidence: 0.9, reasons: ['Simple'], riskFlags: [], route: 'single-agent', score: 1, suggestedWorkers: 1 },
        outputTokens: 1_000,
      }),
    })

    const result = await model.assessComplexity({ context: { availableFiles: [], constraints: [] }, objective: 'Inspect' })
    expect(result.usage.costUsd).toBeGreaterThan(0)
  })
})
