import { describe, expect, it, vi } from 'vitest'
import { AiSdkAxisReviewerQualificationAdapter } from '../../src/main/services/ai-sdk-axis-reviewer-qualification-adapter'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = { baseUrl: 'https://api.openai.com/v1', hasApiKey: true, id: 'p1', isActive: true,
  kind: 'openai', label: 'OpenAI', model: 'worker', updatedAt: '2026-08-14T00:00:00.000Z' }

describe('AI SDK Reviewer qualification Adapter', () => {
  it('runs a minimal strict structured call and returns measured usage without tools', async () => {
    const runStructured = vi.fn().mockResolvedValue({ inputTokens: 20, output: { nonce: 'pivot-reviewer-qualified', schemaVersion: 1 }, outputTokens: 10 })
    const result = await new AiSdkAxisReviewerQualificationAdapter({ runStructured }).qualify({ apiKey: 'secret', modelId: 'review', provider })
    expect(result.output).toEqual({ nonce: 'pivot-reviewer-qualified', schemaVersion: 1 })
    expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 10 })
    const call = runStructured.mock.calls[0]![0]
    expect(call.prompt).toMatch(/no tools|without tools/i)
    expect(call.maxOutputTokens).toBe(128)
    expect(call).not.toHaveProperty('tools')
  })
})
