import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceCatalogTrustRegistry } from '../../src/main/services/marketplace-catalog-trust-registry'
import { NodeHttpsMarketplacePackageStagingAdapter } from '../../src/main/services/node-https-marketplace-package-staging-adapter'
import { NodeMarketplacePackageArtifactInspectionAdapter } from '../../src/main/services/node-marketplace-package-artifact-inspection-adapter'
import { VerifiedMarketplacePackageArtifactAdapter } from '../../src/main/services/verified-marketplace-package-artifact-adapter'
import { VerifiedMarketplacePackageDownloadAdapter } from '../../src/main/services/verified-marketplace-package-download-adapter'
import { NodeMarketplacePublisherCryptoAdapter } from '../../src/publisher/node-marketplace-publisher-crypto-adapter'
import { MarketplacePublisher } from '../../src/publisher/marketplace-publisher'
import { MarketplacePackageArtifactDescriptorSchema } from '../../src/shared/marketplace-contracts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('verified Marketplace package download adapter', () => {
  it('rejects a symbolic-link staging directory before exposing filesystem capability', () => {
    const parent = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-staging-link-')))
    roots.push(parent)
    const target = path.join(parent, 'target')
    const alias = path.join(parent, 'alias')
    mkdirSync(target)
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => new NodeHttpsMarketplacePackageStagingAdapter({ stagingDirectory: alias }))
      .toThrow(/real directory/i)
  })

  it('stages bounded HTTPS bytes, verifies the production signature and exposes idempotent cleanup', async () => {
    const bytes = Buffer.from('downloaded signed package bytes')
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', method: 'GET', redirect: 'manual' })
      return packageResponse(bytes)
    }) as unknown as typeof fetch
    const fixture = createFixture(bytes, { fetchImpl })

    const staged = await fixture.download.downloadAndVerify(fixture.intent)

    expect(staged.evidence.status).toBe('verified')
    expect(readFileSync(staged.artifactPath)).toEqual(bytes)
    expect(path.dirname(staged.artifactPath)).toBe(fixture.root)
    expect(staged.artifactPath).toMatch(/\.staged$/)
    await staged.discard()
    await staged.discard()
    expect(existsSync(staged.artifactPath)).toBe(false)
    expect(readdirSync(fixture.root)).toEqual([])
  })

  it('lends only the verified staged file identity and blocks cleanup or replacement races', async () => {
    const bytes = Buffer.from('stable archive bytes')
    const fixture = createFixture(bytes)
    const staged = await fixture.download.downloadAndVerify(fixture.intent)
    const lease = await staged.acquireReadLease()

    expect(readFileSync(lease.fileDescriptor)).toEqual(bytes)
    await expect(staged.discard()).rejects.toThrow(/active read lease/i)
    await lease.release()
    await staged.discard()

    const replacedFixture = createFixture(bytes)
    const replaced = await replacedFixture.download.downloadAndVerify(replacedFixture.intent)
    renameSync(replaced.artifactPath, `${replaced.artifactPath}.old`)
    writeFileSync(replaced.artifactPath, bytes)
    await expect(replaced.acquireReadLease()).rejects.toThrow(/identity|replaced/i)
  })

  it('rejects untrusted origins, credentials, query strings and redirects before retaining bytes', async () => {
    const bytes = Buffer.from('package')
    const fetchImpl = vi.fn(async () => packageResponse(bytes, { status: 302 })) as unknown as typeof fetch
    const fixture = createFixture(bytes, { fetchImpl })

    await expect(fixture.download.downloadAndVerify({
      ...fixture.intent,
      downloadUrl: 'https://other.invalid/package.pivot',
    })).rejects.toThrow(/origin/i)
    expect(fetchImpl).not.toHaveBeenCalled()

    await expect(fixture.download.downloadAndVerify({
      ...fixture.intent,
      downloadUrl: 'https://user:pass@catalog.pivot.invalid/package.pivot',
    })).rejects.toThrow(/credentials/i)
    await expect(fixture.download.downloadAndVerify({
      ...fixture.intent,
      downloadUrl: 'https://catalog.pivot.invalid/package.pivot?token=secret',
    })).rejects.toThrow(/query/i)

    await expect(fixture.download.downloadAndVerify(fixture.intent)).rejects.toThrow(/redirect/i)
    expect(readdirSync(fixture.root)).toEqual([])
  })

  it('rejects missing, invalid, truncated and overflowing Content-Length evidence without residue', async () => {
    const bytes = Buffer.from('expected package bytes')
    const cases: Array<{ name: string; response: Response; pattern: RegExp }> = [
      { name: 'missing', response: packageResponse(bytes, { omitLength: true }), pattern: /Content-Length/i },
      { name: 'invalid', response: packageResponse(bytes, { contentLength: 'NaN' }), pattern: /Content-Length/i },
      { name: 'truncated', response: packageResponse(bytes.subarray(0, 4), { contentLength: String(bytes.byteLength) }), pattern: /truncated|byte length/i },
      { name: 'overflowing', response: packageResponse(Buffer.concat([bytes, Buffer.from('!')]), { contentLength: String(bytes.byteLength) }), pattern: /exceeds|byte length/i },
    ]

    for (const testCase of cases) {
      const fixture = createFixture(bytes, {
        fetchImpl: vi.fn(async () => testCase.response.clone()) as unknown as typeof fetch,
      })
      await expect(fixture.download.downloadAndVerify(fixture.intent), testCase.name)
        .rejects.toThrow(testCase.pattern)
      expect(readdirSync(fixture.root), testCase.name).toEqual([])
    }
  })

  it('removes staged bytes when digest verification fails', async () => {
    const expected = Buffer.from('trusted package')
    const tampered = Buffer.from('changed package')
    expect(tampered.byteLength).toBe(expected.byteLength)
    const fixture = createFixture(expected, {
      fetchImpl: vi.fn(async () => packageResponse(tampered)) as unknown as typeof fetch,
    })

    await expect(fixture.download.downloadAndVerify(fixture.intent)).rejects.toThrow(/SHA-256|digest/i)
    expect(readdirSync(fixture.root)).toEqual([])
  })

  it('fails closed on cancellation, timeout and transport failure without partial files', async () => {
    const bytes = Buffer.from('package')
    const cancelled = createFixture(bytes, { fetchImpl: vi.fn() as unknown as typeof fetch })
    const controller = new AbortController()
    controller.abort()
    await expect(cancelled.download.downloadAndVerify(cancelled.intent, controller.signal))
      .rejects.toThrow(/cancel|abort/i)
    expect(cancelled.fetchImpl).not.toHaveBeenCalled()
    expect(readdirSync(cancelled.root)).toEqual([])

    const timeout = createFixture(bytes, {
      fetchImpl: vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
        pull: () => new Promise(() => undefined),
      }), {
        headers: {
          'content-length': String(bytes.byteLength),
          'content-type': 'application/octet-stream',
        },
        status: 200,
      })) as unknown as typeof fetch,
      timeoutMs: 10,
    })
    await expect(timeout.download.downloadAndVerify(timeout.intent)).rejects.toThrow(/timed out/i)
    expect(readdirSync(timeout.root)).toEqual([])

    const failed = createFixture(bytes, {
      fetchImpl: vi.fn(async () => { throw new Error('network down') }) as unknown as typeof fetch,
    })
    await expect(failed.download.downloadAndVerify(failed.intent)).rejects.toThrow(/network down/i)
    expect(readdirSync(failed.root)).toEqual([])
  })

  it('rejects an invalid package signature before starting a network request', async () => {
    const bytes = Buffer.from('package')
    const fetchImpl = vi.fn(async () => packageResponse(bytes)) as unknown as typeof fetch
    const fixture = createFixture(bytes, { fetchImpl })

    await expect(fixture.download.downloadAndVerify({
      ...fixture.intent,
      signature: { ...fixture.intent.signature, value: Buffer.alloc(64, 9).toString('base64') },
    })).rejects.toThrow(/signature/i)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(readdirSync(fixture.root)).toEqual([])
  })
})

function createFixture(bytes: Buffer, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-download-')))
  roots.push(root)
  const crypto = new NodeMarketplacePublisherCryptoAdapter()
  const publisher = new MarketplacePublisher({ crypto })
  const keyset = publisher.createKeyset({ keyId: 'pivot-marketplace-test-key' })
  const descriptor = MarketplacePackageArtifactDescriptorSchema.parse({
    byteLength: bytes.byteLength,
    kind: 'skill',
    resourceId: 'dev.pivot.download-test',
    schemaVersion: 1,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceId: 'official',
    version: '1.0.0',
  })
  const signed = publisher.signPackageArtifact({ descriptor, keyset })
  const source = {
    catalogUrl: 'https://catalog.pivot.invalid/catalog.json',
    displayName: 'Pivot Test Catalog',
    id: 'official',
    schemaVersion: 1 as const,
    trust: { algorithm: 'ed25519' as const, keyId: keyset.manifest.keyId },
  }
  const trust = new MarketplaceCatalogTrustRegistry([{
    publicKeyPem: keyset.manifest.publicKeyPem,
    source,
  }]).openReaderPort()
  const verification = new VerifiedMarketplacePackageArtifactAdapter({
    inspection: new NodeMarketplacePackageArtifactInspectionAdapter().openInspectionPort(),
    trust,
  }).openVerificationPort()
  const fetchImpl = options.fetchImpl ?? (vi.fn(async () => packageResponse(bytes)) as unknown as typeof fetch)
  const staging = new NodeHttpsMarketplacePackageStagingAdapter({
    fetchImpl,
    stagingDirectory: root,
    timeoutMs: options.timeoutMs,
  }).openStagingPort()
  const download = new VerifiedMarketplacePackageDownloadAdapter({
    staging,
    trust,
    verification,
  }).openDownloadPort()
  return {
    download,
    fetchImpl,
    intent: {
      descriptor: signed.descriptor,
      downloadUrl: 'https://catalog.pivot.invalid/packages/download-test.pivot',
      schemaVersion: 1 as const,
      signature: signed.signature,
    },
    root,
  }
}

function packageResponse(bytes: Uint8Array, options: {
  contentLength?: string
  omitLength?: boolean
  status?: number
} = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream' }
  if (!options.omitLength) headers['content-length'] = options.contentLength ?? String(bytes.byteLength)
  const body = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(body).set(bytes)
  return new Response(body, { headers, status: options.status ?? 200 })
}
