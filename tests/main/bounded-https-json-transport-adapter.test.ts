import { describe, expect, it, vi } from 'vitest'
import { BoundedHttpsJsonTransportAdapter } from '../../src/main/services/bounded-https-json-transport-adapter'

describe('bounded HTTPS JSON Transport Adapter', () => {
  it('fetches strict JSON over HTTPS with manual redirects and no credentials', async () => {
    const calls: Array<{ input: string; init: RequestInit }> = []
    const transport = createTransport(async (input, init) => {
      calls.push({ input: String(input), init: init ?? {} })
      return jsonResponse({ entries: [], revision: 1 }, {
        contentType: 'application/vnd.pivot.catalog+json; charset=utf-8',
      })
    })

    await expect(transport.fetchJson('https://catalog.pivot.invalid/v1/catalog.json'))
      .resolves.toEqual({ entries: [], revision: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      input: 'https://catalog.pivot.invalid/v1/catalog.json',
      init: { credentials: 'omit', method: 'GET', redirect: 'manual' },
    })
    expect(new Headers(calls[0]!.init.headers).get('accept')).toContain('application/json')
  })

  it('rejects non-HTTPS, credential-bearing and fragment-bearing URLs before fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const transport = createTransport(fetchImpl)

    await expect(transport.fetchJson('http://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/HTTPS/i)
    await expect(transport.fetchJson('https://user:secret@catalog.pivot.invalid/catalog.json')).rejects.toThrow(/credentials/i)
    await expect(transport.fetchJson('https://catalog.pivot.invalid/catalog.json#signed')).rejects.toThrow(/fragment/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects redirects and every non-200 response', async () => {
    const redirect = createTransport(async () => new Response(null, {
      headers: { location: 'https://mirror.pivot.invalid/catalog.json' },
      status: 302,
    }))
    await expect(redirect.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/redirect/i)

    const failure = createTransport(async () => new Response('{"error":"down"}', {
      headers: { 'content-type': 'application/json' },
      status: 503,
    }))
    await expect(failure.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/503|status/i)
  })

  it('rejects missing or non-JSON Content-Type', async () => {
    const missing = createTransport(async () => new Response('{}', { status: 200 }))
    await expect(missing.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/Content-Type/i)

    const html = createTransport(async () => new Response('<html/>', {
      headers: { 'content-type': 'text/html' },
      status: 200,
    }))
    await expect(html.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/Content-Type|JSON/i)
  })

  it('rejects an oversized declared or streaming response body', async () => {
    const declared = new BoundedHttpsJsonTransportAdapter({
      fetchImpl: async () => jsonResponse({ ok: true }, { contentLength: 33 }),
      maxBytes: 32,
    }).openPort()
    await expect(declared.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/32|large|size/i)

    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true },
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":"'))
        controller.enqueue(new TextEncoder().encode('1234567890"}'))
      },
    })
    const streaming = new BoundedHttpsJsonTransportAdapter({
      fetchImpl: async () => new Response(stream, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
      maxBytes: 12,
    }).openPort()
    await expect(streaming.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/12|large|size/i)
    expect(cancelled).toBe(true)
  })

  it('aborts a request when the bounded timeout elapses', async () => {
    let observedAbort = false
    const transport = new BoundedHttpsJsonTransportAdapter({
      fetchImpl: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          observedAbort = true
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      }),
      timeoutMs: 10,
    }).openPort()

    await expect(transport.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/timeout|timed out/i)
    expect(observedAbort).toBe(true)
  })

  it('keeps the timeout active while a response body stalls', async () => {
    let cancelled = false
    const stalledBody = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true },
      start(controller) { controller.enqueue(new TextEncoder().encode('{')) },
    })
    const transport = new BoundedHttpsJsonTransportAdapter({
      fetchImpl: async () => new Response(stalledBody, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
      timeoutMs: 10,
    }).openPort()

    await expect(transport.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/timeout|timed out/i)
    expect(cancelled).toBe(true)
  })

  it('rejects malformed JSON and invalid UTF-8', async () => {
    const malformed = createTransport(async () => new Response('{bad-json', {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))
    await expect(malformed.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/malformed|JSON/i)

    const invalidUtf8 = createTransport(async () => new Response(
      new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]),
      { headers: { 'content-type': 'application/json' }, status: 200 },
    ))
    await expect(invalidUtf8.fetchJson('https://catalog.pivot.invalid/catalog.json')).rejects.toThrow(/UTF-8/i)
  })

  it('validates timeout and response-size configuration', () => {
    expect(() => new BoundedHttpsJsonTransportAdapter({ timeoutMs: 0 })).toThrow(/timeout/i)
    expect(() => new BoundedHttpsJsonTransportAdapter({ maxBytes: 0 })).toThrow(/size|bytes/i)
    expect(() => new BoundedHttpsJsonTransportAdapter({ maxBytes: 6 * 1024 * 1024 })).toThrow(/size|bytes/i)
  })
})

function createTransport(fetchImpl: typeof fetch) {
  return new BoundedHttpsJsonTransportAdapter({ fetchImpl }).openPort()
}

function jsonResponse(
  value: unknown,
  options: { contentLength?: number; contentType?: string } = {},
): Response {
  const body = JSON.stringify(value)
  const headers = new Headers({
    'content-type': options.contentType ?? 'application/json; charset=utf-8',
  })
  if (options.contentLength !== undefined) headers.set('content-length', String(options.contentLength))
  return new Response(body, { headers, status: 200 })
}
