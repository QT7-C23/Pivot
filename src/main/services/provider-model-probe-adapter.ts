import { z } from 'zod'
import type { ProviderConfig } from '../../shared/types/domain'
import { createNodeProviderPinnedFetch } from './node-provider-pinned-fetch-adapter'
import type { ProviderModelProbePort } from './provider-model-probe-port'
import { createProviderBoundFetch, validateAndNormalizeProviderEndpoint } from './provider-trust-policy'

const DEFAULT_MAX_BYTES = 512 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_MODELS = 100
const ModelResponseSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1).max(160) }).passthrough()).max(10_000),
}).passthrough()

export class ProviderModelProbeAdapter {
  private readonly fetcher?: typeof fetch
  private readonly maxBytes: number
  private readonly timeoutMs: number

  constructor(options: { fetcher?: typeof fetch; maxBytes?: number; timeoutMs?: number } = {}) {
    this.fetcher = options.fetcher
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > 2 * 1024 * 1024) {
      throw new Error('Provider model probe size must be between 1 and 2097152 bytes')
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000) {
      throw new Error('Provider model probe timeout must be between 1 and 60000 ms')
    }
  }

  openPort(): ProviderModelProbePort {
    return Object.freeze({
      probe: (provider: Readonly<ProviderConfig>, apiKey: string) => this.probe(provider, apiKey),
    })
  }

  private async probe(provider: Readonly<ProviderConfig>, apiKey: string) {
    if (!apiKey.trim()) throw new Error('Provider model probe requires an API key')
    const baseUrl = validateAndNormalizeProviderEndpoint(provider.kind, provider.baseUrl)
    const providerFetch = this.fetcher
      ? createProviderBoundFetch(provider, this.fetcher)
      : createNodeProviderPinnedFetch(provider)
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, this.timeoutMs)
    timeout.unref?.()
    try {
      const response = await providerFetch(`${baseUrl}/models`, {
        headers: provider.kind === 'anthropic'
          ? { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey }
          : { Authorization: `Bearer ${apiKey}` },
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      })
      if (response.redirected || response.status !== 200) {
        await response.body?.cancel()
        throw new Error(`Provider model probe returned HTTP ${response.status}`)
      }
      if (!isJson(response.headers.get('content-type'))) {
        await response.body?.cancel()
        throw new Error('Provider model probe requires a JSON Content-Type')
      }
      const body = await readBoundedJson(response, this.maxBytes, controller.signal)
      const parsed = ModelResponseSchema.safeParse(body)
      if (!parsed.success) throw new Error(`Provider model response is invalid: ${parsed.error.issues[0]?.message ?? 'invalid response'}`)
      const models = [...new Set(parsed.data.data.map(({ id }) => id))].sort()
      return Object.freeze({
        models: Object.freeze(models.slice(0, MAX_MODELS)),
        truncated: models.length > MAX_MODELS,
      })
    } catch (error) {
      if (timedOut) throw new Error(`Provider model probe timed out after ${this.timeoutMs} ms`, { cause: error })
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

function isJson(value: string | null): boolean {
  const type = value?.split(';', 1)[0]?.trim().toLowerCase()
  return type === 'application/json' || Boolean(type && /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(type))
}

async function readBoundedJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel()
    throw new Error(`Provider model response exceeds ${maxBytes} bytes`)
  }
  if (!response.body) throw new Error('Provider model response body is missing')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal)
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('Provider model response is too large')
        throw new Error(`Provider model response exceeds ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (signal.aborted) await reader.cancel('Provider model probe aborted').catch(() => undefined)
    throw error
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch (error) { throw new Error('Provider model response is not valid UTF-8', { cause: error }) }
  try { return JSON.parse(text) as unknown }
  catch (error) { throw new Error('Provider model response contains malformed JSON', { cause: error }) }
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
  return await new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
