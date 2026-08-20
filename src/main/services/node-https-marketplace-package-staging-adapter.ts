import { randomUUID } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { lstat, open, rename, unlink, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { MAX_MARKETPLACE_PACKAGE_BYTES } from '../../shared/marketplace-contracts'
import type {
  MarketplacePackageStagingPort,
  MarketplacePackageStagingRequest,
  MarketplaceStagedArtifactPort,
} from './marketplace-package-download-ports'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const PACKAGE_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
])

export class NodeHttpsMarketplacePackageStagingAdapter {
  private readonly fetchImpl: typeof fetch
  private readonly stagingDirectory: string
  private readonly timeoutMs: number

  constructor(options: {
    readonly fetchImpl?: typeof fetch
    readonly stagingDirectory: string
    readonly timeoutMs?: number
  }) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.stagingDirectory = requireStableDirectory(options.stagingDirectory)
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error(`Marketplace package timeout must be between 1 and ${MAX_TIMEOUT_MS} ms`)
    }
  }

  openStagingPort(): MarketplacePackageStagingPort {
    return Object.freeze({
      stage: (request: MarketplacePackageStagingRequest) => this.stage(request),
    })
  }

  private async stage(request: MarketplacePackageStagingRequest): Promise<MarketplaceStagedArtifactPort> {
    const url = requireSafePackageUrl(request.downloadUrl)
    requireExpectedByteLength(request.expectedByteLength)
    if (request.signal?.aborted) throw new Error('Marketplace package download was cancelled')
    requireStableDirectory(this.stagingDirectory)

    const identifier = randomUUID()
    const partialPath = path.join(this.stagingDirectory, `${identifier}.partial`)
    const stagedPath = path.join(this.stagingDirectory, `${identifier}.staged`)
    const controller = new AbortController()
    let timedOut = false
    const cancel = () => controller.abort()
    request.signal?.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    timeout.unref?.()
    let handle: FileHandle | undefined

    try {
      handle = await open(partialPath, 'wx', 0o600)
      const response = await this.fetchImpl(url.href, {
        cache: 'no-store',
        credentials: 'omit',
        headers: Object.freeze({ accept: [...PACKAGE_CONTENT_TYPES].join(', ') }),
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      })
      requireSuccessfulPackageResponse(response, request.expectedByteLength)
      await streamResponseToFile(response, handle, request.expectedByteLength, controller.signal)
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(partialPath, stagedPath)
      return await createStagedArtifactPort(stagedPath)
    } catch (error) {
      await handle?.close().catch(() => undefined)
      await removeIfPresent(partialPath)
      await removeIfPresent(stagedPath)
      if (timedOut) {
        throw new Error(`Marketplace package download timed out after ${this.timeoutMs} ms`, { cause: error })
      }
      if (request.signal?.aborted) {
        throw new Error('Marketplace package download was cancelled', { cause: error })
      }
      throw error
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', cancel)
    }
  }
}

function requireStableDirectory(input: string): string {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error('Marketplace package staging directory must be absolute')
  }
  const resolved = path.resolve(input)
  const stats = lstatSync(resolved)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Marketplace package staging directory must be a real directory')
  }
  return realpathSync.native(resolved)
}

function requireSafePackageUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch (error) {
    throw new Error('Marketplace package requires a valid HTTPS URL', { cause: error })
  }
  if (url.protocol !== 'https:') throw new Error('Marketplace package download requires HTTPS')
  if (url.username || url.password) throw new Error('Marketplace package URL cannot contain credentials')
  if (url.search) throw new Error('Marketplace package URL cannot contain a query string')
  if (url.hash) throw new Error('Marketplace package URL cannot contain a fragment')
  return url
}

function requireExpectedByteLength(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MARKETPLACE_PACKAGE_BYTES) {
    throw new Error('Marketplace package expected byte length is invalid')
  }
}

function requireSuccessfulPackageResponse(response: Response, expectedByteLength: number): void {
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error('Marketplace package redirects are not allowed')
  }
  if (response.status !== 200) {
    throw new Error(`Marketplace package returned HTTP status ${response.status}`)
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!contentType || !PACKAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error('Marketplace package response requires an approved binary Content-Type')
  }
  const declaredLength = response.headers.get('content-length')
  if (declaredLength === null || !/^\d+$/.test(declaredLength)) {
    throw new Error('Marketplace package Content-Length is required and must be valid')
  }
  if (Number(declaredLength) !== expectedByteLength) {
    throw new Error('Marketplace package Content-Length does not match the signed byte length')
  }
}

async function streamResponseToFile(
  response: Response,
  handle: FileHandle,
  expectedByteLength: number,
  signal: AbortSignal,
): Promise<void> {
  if (!response.body) throw new Error('Marketplace package response body is missing')
  const reader = response.body.getReader()
  let total = 0
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal)
      if (done) break
      if (!value || value.byteLength === 0) continue
      total += value.byteLength
      if (total > expectedByteLength) {
        void reader.cancel('Marketplace package response exceeds signed byte length').catch(() => undefined)
        throw new Error('Marketplace package response exceeds the signed byte length')
      }
      await writeAll(handle, value)
    }
  } catch (error) {
    if (signal.aborted) {
      void reader.cancel('Marketplace package request aborted').catch(() => undefined)
    }
    throw error
  }
  if (total !== expectedByteLength) {
    throw new Error('Marketplace package response was truncated before the signed byte length')
  }
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset)
    if (bytesWritten < 1) throw new Error('Marketplace package staging write made no progress')
    offset += bytesWritten
  }
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

async function createStagedArtifactPort(artifactPath: string): Promise<MarketplaceStagedArtifactPort> {
  const identity = await lstat(artifactPath, { bigint: true })
  if (identity.isSymbolicLink() || !identity.isFile()) {
    throw new Error('Marketplace staged package must be a regular file')
  }
  let discarded = false
  let activeReadLeases = 0
  return Object.freeze({
    artifactPath,
    async acquireReadLease() {
      if (discarded) throw new Error('Marketplace staged package was already discarded')
      const handle = await open(artifactPath, 'r')
      try {
        const [opened, current] = await Promise.all([
          handle.stat({ bigint: true }),
          lstat(artifactPath, { bigint: true }),
        ])
        if (opened.isSymbolicLink() || !opened.isFile()
          || current.isSymbolicLink() || !current.isFile()
          || opened.dev !== identity.dev || opened.ino !== identity.ino
          || current.dev !== identity.dev || current.ino !== identity.ino) {
          throw new Error('Marketplace staged package identity was replaced before reading')
        }
        activeReadLeases += 1
        let released = false
        return Object.freeze({
          artifactPath,
          fileDescriptor: handle.fd,
          async release() {
            if (released) return
            released = true
            activeReadLeases -= 1
            await handle.close()
          },
        })
      } catch (error) {
        await handle.close().catch(() => undefined)
        throw error
      }
    },
    async discard() {
      if (discarded) return
      if (activeReadLeases > 0) {
        throw new Error('Marketplace staged package has an active read lease')
      }
      let current
      try {
        current = await lstat(artifactPath, { bigint: true })
      } catch (error) {
        if (isMissing(error)) {
          discarded = true
          return
        }
        throw error
      }
      if (current.isSymbolicLink() || !current.isFile()
        || current.dev !== identity.dev || current.ino !== identity.ino) {
        throw new Error('Marketplace staged package identity changed before cleanup')
      }
      await unlink(artifactPath)
      discarded = true
    },
  })
}

async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
