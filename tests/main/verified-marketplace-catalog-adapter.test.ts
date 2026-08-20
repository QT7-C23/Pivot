import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MarketplaceCatalogPayloadSchema,
  MarketplaceCatalogSnapshotSchema,
  serializeMarketplaceCatalogPayload,
  type MarketplaceCatalogSnapshot,
} from '../../src/shared/marketplace-contracts'
import type { MarketplaceCatalogTransportPort } from '../../src/main/services/marketplace-catalog-ports'
import { MarketplaceCatalogTrustRegistry } from '../../src/main/services/marketplace-catalog-trust-registry'
import { SqliteMarketplaceCatalogCacheAdapter } from '../../src/main/services/sqlite-marketplace-catalog-cache-adapter'
import { VerifiedMarketplaceCatalogAdapter } from '../../src/main/services/verified-marketplace-catalog-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('verified Marketplace Catalog adapter', () => {
  it('verifies a real Ed25519 signature before caching and returning a snapshot', async () => {
    const fixture = createSignedFixture(3)
    const cache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    const reader = createReader({ cache, fixture, transport: returning(fixture.snapshot) })

    const snapshot = await reader.readSnapshot()

    expect(snapshot.revision).toBe(3)
    expect(cache.openReaderPort().read('official')).toEqual(snapshot)
    expect(Object.isFrozen(snapshot)).toBe(true)
    cache.close()
  })

  it('rejects remote tampering without hiding it behind a valid cache', async () => {
    const fixture = createSignedFixture(1)
    const cache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    await createReader({ cache, fixture, transport: returning(fixture.snapshot) }).readSnapshot()
    const tampered = structuredClone(fixture.snapshot) as unknown as {
      entries: Array<{ description: string }>
    }
    tampered.entries[0]!.description = 'Tampered after signing'

    await expect(createReader({ cache, fixture, transport: returning(tampered) }).readSnapshot())
      .rejects.toThrow(/signature/i)
    expect(cache.openReaderPort().read('official')?.entries[0]?.description)
      .toBe(fixture.snapshot.entries[0]?.description)
    cache.close()
  })

  it('rejects expired, future-issued and unknown-key snapshots', async () => {
    const expired = createSignedFixture(1, {
      expiresAt: '2026-08-10T00:00:00.000Z',
      generatedAt: '2026-08-09T00:00:00.000Z',
    })
    const expiredCache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    await expect(createReader({ cache: expiredCache, fixture: expired, transport: returning(expired.snapshot) }).readSnapshot())
      .rejects.toThrow(/expired/i)
    expiredCache.close()

    const future = createSignedFixture(1, {
      expiresAt: '2026-08-13T00:00:00.000Z',
      generatedAt: '2026-08-12T00:00:00.000Z',
    })
    const futureCache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    await expect(createReader({ cache: futureCache, fixture: future, transport: returning(future.snapshot) }).readSnapshot())
      .rejects.toThrow(/future|not valid yet/i)
    futureCache.close()

    const trusted = createSignedFixture(1)
    const unknown = createSignedFixture(1, { keyId: 'untrusted-2026' })
    const unknownCache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    await expect(createReader({
      cache: unknownCache,
      fixture: trusted,
      transport: returning(unknown.snapshot),
    }).readSnapshot()).rejects.toThrow(/trusted|key/i)
    unknownCache.close()
  })

  it('uses a still-valid verified cache only after transport failure and survives restart', async () => {
    const fixture = createSignedFixture(4)
    const databasePath = createDatabasePath()
    const firstCache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath })
    const expected = await createReader({
      cache: firstCache,
      fixture,
      transport: returning(fixture.snapshot),
    }).readSnapshot()
    firstCache.close()

    const reopenedCache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath })
    const offline = createReader({
      cache: reopenedCache,
      fixture,
      transport: failing(new Error('network unavailable')),
    })
    await expect(offline.readSnapshot()).resolves.toEqual(expected)
    reopenedCache.close()
  })

  it('fails closed when transport and cached evidence are both unusable', async () => {
    const fixture = createSignedFixture(1)
    const cache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })

    await expect(createReader({
      cache,
      fixture,
      transport: failing(new Error('DNS failure')),
    }).readSnapshot()).rejects.toThrow(/unavailable|cache/i)
    cache.close()

    const expired = createSignedFixture(1, {
      expiresAt: '2026-08-10T00:00:00.000Z',
      generatedAt: '2026-08-09T00:00:00.000Z',
    })
    const expiredCache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    expiredCache.openWriterPort().write(expired.snapshot)
    await expect(createReader({
      cache: expiredCache,
      fixture: expired,
      transport: failing(new Error('offline')),
    }).readSnapshot()).rejects.toThrow(/unavailable|cache/i)
    expiredCache.close()
  })

  it('rejects signed revision rollback and same-revision equivocation', async () => {
    const current = createSignedFixture(2)
    const databasePath = createDatabasePath()
    const cache = new SqliteMarketplaceCatalogCacheAdapter({ databasePath })
    await createReader({ cache, fixture: current, transport: returning(current.snapshot) }).readSnapshot()

    const rollback = signPayload(createPayload(1), current.privateKey)
    await expect(createReader({ cache, fixture: current, transport: returning(rollback) }).readSnapshot())
      .rejects.toThrow(/rollback|revision/i)

    const changedPayload = createPayload(2)
    changedPayload.entries[0]!.description = 'Different signed content at the same revision'
    const equivocation = signPayload(changedPayload, current.privateKey)
    await expect(createReader({ cache, fixture: current, transport: returning(equivocation) }).readSnapshot())
      .rejects.toThrow(/revision|equivocation/i)
    cache.close()
  })

  it('rejects duplicate trust sources and non-Ed25519 public keys', () => {
    const fixture = createSignedFixture(1)
    const config = { publicKeyPem: fixture.publicKeyPem, source: fixture.snapshot.source }
    expect(() => new MarketplaceCatalogTrustRegistry([config, config])).toThrow(/unique/i)

    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(() => new MarketplaceCatalogTrustRegistry([{
      publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      source: fixture.snapshot.source,
    }])).toThrow(/Ed25519/i)
  })
})

function createReader(options: {
  cache: SqliteMarketplaceCatalogCacheAdapter
  fixture: ReturnType<typeof createSignedFixture>
  transport: MarketplaceCatalogTransportPort
}) {
  const trust = new MarketplaceCatalogTrustRegistry([{
    publicKeyPem: options.fixture.publicKeyPem,
    source: options.fixture.snapshot.source,
  }])
  return new VerifiedMarketplaceCatalogAdapter({
    cache: options.cache.openPort(),
    clock: () => new Date('2026-08-11T12:00:00.000Z'),
    sourceId: 'official',
    transport: options.transport,
    trust: trust.openReaderPort(),
  }).openReaderPort()
}

function createSignedFixture(
  revision: number,
  overrides: { expiresAt?: string; generatedAt?: string; keyId?: string } = {},
) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keyId = overrides.keyId ?? 'pivot-official-2026'
  const payload = createPayload(revision, { ...overrides, keyId })
  return {
    privateKey,
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    snapshot: signPayload(payload, privateKey),
  }
}

function createPayload(
  revision: number,
  overrides: { expiresAt?: string; generatedAt?: string; keyId?: string } = {},
) {
  const keyId = overrides.keyId ?? 'pivot-official-2026'
  return {
    entries: [{
      compatibility: { minPivotVersion: '1.6.0-beta' },
      description: 'Reviews React changes without execution authority.',
      distribution: { free: true as const },
      kind: 'skill' as const,
      manifestUrl: 'https://catalog.pivot.invalid/manifests/react-reviewer.json',
      name: 'React Code Reviewer',
      package: {
        byteLength: 12_345,
        downloadUrl: 'https://catalog.pivot.invalid/packages/react-reviewer.zip',
        sha256: 'a'.repeat(64),
        signature: {
          algorithm: 'ed25519' as const,
          keyId,
          value: Buffer.alloc(64, 7).toString('base64'),
        },
      },
      publisher: { id: 'dev.pivot', name: 'Pivot', url: 'https://pivot.invalid' },
      resourceId: 'dev.pivot.react-reviewer',
      schemaVersion: 1 as const,
      sourceId: 'official',
      tags: ['review', 'react'],
      updatedAt: overrides.generatedAt ?? '2026-08-11T00:00:00.000Z',
      version: '1.0.0',
    }],
    expiresAt: overrides.expiresAt ?? '2026-08-12T00:00:00.000Z',
    generatedAt: overrides.generatedAt ?? '2026-08-11T00:00:00.000Z',
    revision,
    schemaVersion: 1 as const,
    source: {
      catalogUrl: 'https://catalog.pivot.invalid/catalog.json',
      displayName: 'Pivot Official',
      id: 'official',
      schemaVersion: 1 as const,
      trust: { algorithm: 'ed25519' as const, keyId },
    },
  }
}

function signPayload(payloadInput: ReturnType<typeof createPayload>, privateKey: KeyObject): MarketplaceCatalogSnapshot {
  const payload = MarketplaceCatalogPayloadSchema.parse(payloadInput)
  const signature = sign(
    null,
    Buffer.from(serializeMarketplaceCatalogPayload(payload), 'utf8'),
    privateKey,
  ).toString('base64')
  return MarketplaceCatalogSnapshotSchema.parse({
    ...payload,
    signature: { algorithm: 'ed25519', keyId: payload.source.trust.keyId, value: signature },
  })
}

function returning(value: unknown): MarketplaceCatalogTransportPort {
  return Object.freeze({ fetchJson: async () => structuredClone(value) })
}

function failing(error: Error): MarketplaceCatalogTransportPort {
  return Object.freeze({ fetchJson: async () => { throw error } })
}

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-catalog-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
