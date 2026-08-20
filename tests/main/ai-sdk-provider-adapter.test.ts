import { describe, expect, it, vi } from 'vitest'
import { AiSdkProviderAdapter, createProviderLanguageModel } from '../../src/main/services/ai-sdk-provider-adapter'
import type { ProviderConfig } from '../../src/shared/types/domain'

const customProvider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1',
  hasApiKey: true,
  id: 'test',
  isActive: true,
  kind: 'custom',
  label: 'Test',
  model: 'model',
  updatedAt: '',
}

describe('AiSdkProviderAdapter', () => {
  it('streams an OpenAI-compatible endpoint through the Vercel AI SDK without exposing its key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response([
      'data: {"id":"one","object":"chat.completion.chunk","created":1,"model":"model","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello "},"finish_reason":null}]}',
      '',
      'data: {"id":"two","object":"chat.completion.chunk","created":1,"model":"model","choices":[{"index":0,"delta":{"content":"Pivot"},"finish_reason":null}]}',
      '',
      'data: {"id":"three","object":"chat.completion.chunk","created":1,"model":"model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' }, status: 200 }))
    const adapter = new AiSdkProviderAdapter(customProvider, 'sk-secret', fetcher)
    const chunks: string[] = []

    for await (const event of adapter.stream({ requestPermission: vi.fn(), sessionId: 's', signal: new AbortController().signal, text: 'Hi' })) {
      if (event.type === 'text') chunks.push(event.text)
    }

    expect(chunks.join('')).toBe('Hello Pivot')
    expect(JSON.stringify(adapter.info)).not.toContain('sk-secret')
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.objectContaining({ method: 'POST' }))
  })

  it('selects dedicated models for Anthropic and OpenAI while retaining a compatible custom adapter', () => {
    const fetcher = vi.fn() as never
    const anthropic = createProviderLanguageModel({ ...customProvider, baseUrl: 'https://api.anthropic.com/v1', kind: 'anthropic' }, 'key', fetcher)
    const openai = createProviderLanguageModel({ ...customProvider, baseUrl: 'https://api.openai.com/v1', kind: 'openai' }, 'key', fetcher)
    const compatible = createProviderLanguageModel(customProvider, 'key', fetcher)

    expect(anthropic).toMatchObject({ provider: expect.stringContaining('anthropic') })
    expect(openai).toMatchObject({ provider: expect.stringContaining('openai') })
    expect(compatible).toMatchObject({ provider: expect.stringContaining('pivot.custom') })
  })

})
