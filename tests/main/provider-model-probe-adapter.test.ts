import { describe, expect, it, vi } from 'vitest'
import { ProviderModelProbeAdapter } from '../../src/main/services/provider-model-probe-adapter'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.openai.com/v1',
  hasApiKey: true,
  id: 'provider-1',
  isActive: true,
  kind: 'openai',
  label: 'Provider',
  model: 'worker-model',
  updatedAt: '2026-08-13T00:00:00.000Z',
}

describe('ProviderModelProbeAdapter', () => {
  it('returns sorted unique bounded identifiers using provider-bound authentication', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Response(JSON.stringify({
      data: [{ id: 'review-z' }, { id: 'review-a' }, { id: 'review-a' }],
    }), { headers: { 'content-type': 'application/json' }, status: 200 }))
    const models = await new ProviderModelProbeAdapter({ fetcher }).openPort().probe(provider, 'secret')
    expect(models).toEqual({ models: ['review-a', 'review-z'], truncated: false })
    expect(fetcher).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      method: 'GET',
      redirect: 'error',
    }))
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get('authorization')).toBe('Bearer secret')
  })

  it('rejects malformed, non-json and oversized responses', async () => {
    const malformed = new ProviderModelProbeAdapter({
      fetcher: async () => new Response('{"data":[{"id":""}]}', { headers: { 'content-type': 'application/json' } }),
    }).openPort()
    await expect(malformed.probe(provider, 'secret')).rejects.toThrow(/model|invalid/i)

    const html = new ProviderModelProbeAdapter({
      fetcher: async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }),
    }).openPort()
    await expect(html.probe(provider, 'secret')).rejects.toThrow(/json|content/i)

    const large = new ProviderModelProbeAdapter({
      fetcher: async () => new Response('x'.repeat(65), { headers: { 'content-type': 'application/json' } }),
      maxBytes: 64,
    }).openPort()
    await expect(large.probe(provider, 'secret')).rejects.toThrow(/64|large|exceed/i)
  })

  it('aborts stalled requests at the configured timeout', async () => {
    const probe = new ProviderModelProbeAdapter({
      fetcher: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      }),
      timeoutMs: 10,
    }).openPort()
    await expect(probe.probe(provider, 'secret')).rejects.toThrow(/timed out|timeout/i)
  })

  it('keeps the timeout active while the response body stalls', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true },
      start(controller) { controller.enqueue(new TextEncoder().encode('{')) },
    })
    const probe = new ProviderModelProbeAdapter({
      fetcher: async () => new Response(body, { headers: { 'content-type': 'application/json' }, status: 200 }),
      timeoutMs: 10,
    }).openPort()
    await expect(probe.probe(provider, 'secret')).rejects.toThrow(/timed out|timeout/i)
    expect(cancelled).toBe(true)
  })
})
