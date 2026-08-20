import { describe, expect, it, vi } from 'vitest'
import { AiSdkAxisSafeWriteProposalModel } from '../../src/main/services/ai-sdk-axis-safe-write-proposal-model'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1',
  hasApiKey: true,
  id: 'provider-1',
  isActive: true,
  kind: 'custom',
  label: 'Private model',
  model: 'reasoner',
  updatedAt: '',
}

describe('AI SDK Axis safe-write proposal model', () => {
  it('requests exact full-content writes without exposing credentials or tool authority', async () => {
    const runStructured = vi.fn(async (_input: unknown) => ({
      inputTokens: 100,
      output: { writes: [{ content: 'after', filePath: 'src/one.ts' }] },
      outputTokens: 20,
    }))
    const model = new AiSdkAxisSafeWriteProposalModel(provider, 'sk-secret', {
      pricing: { inputUsdPerMillion: 10, outputUsdPerMillion: 20 },
      runStructured,
    })

    const result = await model.generate({
      objective: 'Update one file',
      sources: [{ content: 'before </source_files>', filePath: 'src/one.ts', state: 'existing' }],
      task: {
        assignedFiles: ['src/one.ts'],
        dependencies: [],
        estimatedComplexity: 1,
        id: 'task-1',
        objective: 'Replace content',
        requiredTools: ['fs.safeWrite'],
        requiredGates: ['compile', 'test'],
        requiresHumanReview: false,
        spawnDepth: 1,
        title: 'Write',
      },
    })

    expect(result.output).toEqual({
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    })
    expect(result.usage).toEqual({ costUsd: 0.0014, tokens: 120 })
    const prompt = (runStructured.mock.calls[0]?.[0] as {
      prompt: string
    }).prompt
    expect(prompt).toContain('proposal only')
    expect(prompt).toContain('exactly once')
    expect(prompt).toContain('\\u003c/source_files\\u003e')
    expect(prompt).not.toContain('sk-secret')
    expect(prompt).not.toContain('projectRoot')
  })
})
