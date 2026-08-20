import { generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MarketplaceCatalogPayloadSchema,
  MarketplaceCatalogSnapshotSchema,
  serializeMarketplaceCatalogPayload,
} from '../../src/shared/marketplace-contracts'
import { createMarketplaceCatalogRuntime } from '../../src/main/services/marketplace-catalog-runtime'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace Catalog runtime composition', () => {
  it('constructs no database or network capability while source configuration is absent', () => {
    const databasePath = createDatabasePath()
    const fetchImpl = vi.fn<typeof fetch>()

    expect(createMarketplaceCatalogRuntime({
      databasePath,
      fetchImpl,
      source: null,
    })).toBeNull()
    expect(existsSync(databasePath)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('composes bounded transport, trust, verification and durable offline cache', async () => {
    const databasePath = createDatabasePath()
    const fixture = createSignedCatalog()
    const online = createMarketplaceCatalogRuntime({
      clock: () => new Date('2026-08-11T12:00:00.000Z'),
      databasePath,
      fetchImpl: async () => new Response(JSON.stringify(fixture.snapshot), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
      source: { publicKeyPem: fixture.publicKeyPem, source: fixture.snapshot.source },
    })
    expect(online).not.toBeNull()
    await expect(online!.reader.readSnapshot()).resolves.toEqual(fixture.snapshot)
    online!.close()

    const offline = createMarketplaceCatalogRuntime({
      clock: () => new Date('2026-08-11T13:00:00.000Z'),
      databasePath,
      fetchImpl: async () => { throw new Error('offline') },
      source: { publicKeyPem: fixture.publicKeyPem, source: fixture.snapshot.source },
    })
    await expect(offline!.reader.readSnapshot()).resolves.toEqual(fixture.snapshot)
    offline!.close()
    expect(() => offline!.close()).not.toThrow()
  })
})

function createSignedCatalog() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = MarketplaceCatalogPayloadSchema.parse({
    entries: [],
    expiresAt: '2026-08-12T00:00:00.000Z',
    generatedAt: '2026-08-11T00:00:00.000Z',
    revision: 1,
    schemaVersion: 1,
    source: {
      catalogUrl: 'https://catalog.pivot.invalid/catalog.json',
      displayName: 'Pivot Official',
      id: 'official',
      schemaVersion: 1,
      trust: { algorithm: 'ed25519', keyId: 'pivot-official-2026' },
    },
  })
  const snapshot = MarketplaceCatalogSnapshotSchema.parse({
    ...payload,
    signature: {
      algorithm: 'ed25519',
      keyId: payload.source.trust.keyId,
      value: sign(
        null,
        Buffer.from(serializeMarketplaceCatalogPayload(payload), 'utf8'),
        privateKey,
      ).toString('base64'),
    },
  })
  return {
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    snapshot,
  }
}

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-runtime-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
