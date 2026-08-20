import type { MarketplaceCatalogTransportPort } from './marketplace-catalog-ports'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_ALLOWED_BYTES = 5 * 1024 * 1024
const MAX_ALLOWED_TIMEOUT_MS = 60_000

export class BoundedHttpsJsonTransportAdapter {
  private readonly fetchImpl: typeof fetch
  private readonly maxBytes: number
  private readonly timeoutMs: number

  constructor(options: {
    fetchImpl?: typeof fetch
    maxBytes?: number
    timeoutMs?: number
  } = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (
      !Number.isInteger(this.maxBytes)
      || this.maxBytes < 1
      || this.maxBytes > MAX_ALLOWED_BYTES
    ) {
      throw new Error(`Marketplace Catalog response size must be between 1 and ${MAX_ALLOWED_BYTES} bytes`)
    }
    if (
      !Number.isInteger(this.timeoutMs)
      || this.timeoutMs < 1
      || this.timeoutMs > MAX_ALLOWED_TIMEOUT_MS
    ) {
      throw new Error(`Marketplace Catalog timeout must be between 1 and ${MAX_ALLOWED_TIMEOUT_MS} ms`)
    }
  }

  openPort(): MarketplaceCatalogTransportPort {
    return Object.freeze({ fetchJson: (url: string) => this.fetchJson(url) })
  }

  private async fetchJson(urlInput: string): Promise<unknown> {
    const url = requireSafeHttpsUrl(urlInput)
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    timeout.unref?.()

    try {
      const response = await this.fetchImpl(url.href, {
        cache: 'no-store',
        credentials: 'omit',
        headers: Object.freeze({
          accept: 'application/json, application/*+json',
        }),
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      })
      requireSuccessfulJsonResponse(response)
      const declaredLength = response.headers.get('content-length')
      if (declaredLength !== null) {
        if (!/^\d+$/.test(declaredLength)) {
          throw new Error('Marketplace Catalog Content-Length is invalid')
        }
        if (Number(declaredLength) > this.maxBytes) {
          throw new Error(`Marketplace Catalog response exceeds ${this.maxBytes} bytes`)
        }
      }

      const bytes = await readBoundedBody(response, this.maxBytes, controller.signal)
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch (error) {
        throw new Error('Marketplace Catalog response is not valid UTF-8', { cause: error })
      }
      try {
        return JSON.parse(text) as unknown
      } catch (error) {
        throw new Error('Marketplace Catalog response contains malformed JSON', { cause: error })
      }
    } catch (error) {
      if (timedOut) {
        throw new Error(`Marketplace Catalog request timed out after ${this.timeoutMs} ms`, { cause: error })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

function requireSafeHttpsUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch (error) {
    throw new Error('Marketplace Catalog requires a valid HTTPS URL', { cause: error })
  }
  if (url.protocol !== 'https:') {
    throw new Error('Marketplace Catalog transport requires HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('Marketplace Catalog URL cannot contain credentials')
  }
  if (url.hash) {
    throw new Error('Marketplace Catalog URL cannot contain a fragment')
  }
  return url
}

function requireSuccessfulJsonResponse(response: Response): void {
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error('Marketplace Catalog redirects are not allowed')
  }
  if (response.status !== 200) {
    throw new Error(`Marketplace Catalog returned HTTP status ${response.status}`)
  }
  const contentType = response.headers.get('content-type')
  if (!contentType || !isJsonContentType(contentType)) {
    throw new Error('Marketplace Catalog response requires a JSON Content-Type')
  }
}

function isJsonContentType(value: string): boolean {
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType === 'application/json'
    || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw new Error('Marketplace Catalog response body is missing')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal)
      if (done) break
      if (!value || value.byteLength === 0) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('Marketplace Catalog response is too large')
        throw new Error(`Marketplace Catalog response exceeds ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (signal.aborted) await reader.cancel('Marketplace Catalog request aborted').catch(() => undefined)
    throw error
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
  return await new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort)
    })
  })
}
