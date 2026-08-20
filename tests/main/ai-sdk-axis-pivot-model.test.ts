import { describe, expect, it, vi } from 'vitest'
import { AiSdkAxisPivotModel } from '../../src/main/services/ai-sdk-axis-pivot-model'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1',
  hasApiKey: true,
  id: 'provider-1',
  isActive: true,
  kind: 'custom',
  label: 'Private model',
  model: 'reviewer',
  updatedAt: '',
}

describe('AI SDK Axis Pivot model', () => {
  it('uses a read-only structured prompt and reports conservative measured usage', async () => {
    const runStructured = vi.fn(async (_input: { prompt: string }) => ({
      inputTokens: 120,
      output: { action: 'retry', reason: 'Direction needs correction', taskId: 'inspect' },
      outputTokens: 30,
    }))
    const model = new AiSdkAxisPivotModel(provider, 'sk-secret', {
      pricing: { inputUsdPerMillion: 10, outputUsdPerMillion: 20 },
      runStructured,
    })

    const result = await model.decidePivot({
      allowedActions: ['retry', 'replan', 'stop'],
      objective: 'Build Axis state',
      remainingBudget: {
        costUsd: 0.2,
        durationMs: 10_000,
        gateCyclesForFile: 2,
        pivots: 2,
        retriesForTask: 1,
        tokens: 1_000,
      },
      runId: 'run-1',
      sessionId: 'session-1',
      sourceRevision: 4,
      sourceStatus: 'failed',
      trigger: {
        category: 'direction',
        evidenceIds: ['gate-1'],
        summary: 'Reviewer rejected the direction',
        taskId: 'inspect',
      },
    })

    expect(result).toEqual({
      output: { action: 'retry', reason: 'Direction needs correction', taskId: 'inspect' },
      usage: { costUsd: 0.0018, tokens: 150 },
    })
    const prompt = runStructured.mock.calls[0]![0].prompt
    expect(prompt).toContain('Never execute tools')
    expect(prompt).toContain('<allowed_actions>')
    expect(prompt).toContain('<remaining_budget>')
    expect(prompt).toContain('<trigger>')
    expect(prompt).not.toContain('sk-secret')
  })
})
