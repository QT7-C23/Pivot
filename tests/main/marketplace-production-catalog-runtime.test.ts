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
import {
  createMarketplaceProductionCatalogRuntime,
  resolveMarketplaceProductionCatalogConfig,
} from '../../src/main/services/marketplace-production-catalog-runtime'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace production Catalog configuration', () => {
  it('keeps the production runtime honestly unavailable without constructing database or network capability', () => {
    const databasePath = createDatabasePath()
    const fetchImpl = vi.fn<typeof fetch>()

    const runtime = createMarketplaceProductionCatalogRuntime({
      databasePath,
      env: {},
      fetchImpl,
    })

    expect(runtime.state).toEqual({ available: false, reason: 'unconfigured' })
    expect(runtime.reader).toBeNull()
    expect(existsSync(databasePath)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(() => runtime.close()).not.toThrow()
    expect(() => runtime.close()).not.toThrow()
  })

  it('enables only the pinned official trust configuration', () => {
    const config = resolveMarketplaceProductionCatalogConfig({
      PIVOT_MARKETPLACE_CATALOG_ENABLED: '1',
    })

    expect(config).toMatchObject({
      publicKeyPem: expect.stringContaining('BEGIN PUBLIC KEY'),
      source: {
        catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
        id: 'pivot-official',
        trust: { keyId: 'pivot-marketplace-2026-01' },
      },
    })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config!.source)).toBe(true)
  })

  it('does not let the legacy JSON variable replace the official trust root', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const replacementKey = publicKey.export({ format: 'pem', type: 'spki' }).toString()
    const config = resolveMarketplaceProductionCatalogConfig({
      PIVOT_MARKETPLACE_CATALOG_CONFIG: JSON.stringify({
        publicKeyPem: replacementKey,
        source: { catalogUrl: 'https://attacker.invalid/catalog.json' },
      }),
      PIVOT_MARKETPLACE_CATALOG_ENABLED: '1',
    })

    expect(config!.publicKeyPem).not.toBe(replacementKey)
    expect(config!.source.catalogUrl).toBe(
      'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
    )
  })

  it('keeps an explicit zero disabled without constructing database or network capability', () => {
    const databasePath = createDatabasePath()
    const fetchImpl = vi.fn<typeof fetch>()
    const runtime = createMarketplaceProductionCatalogRuntime({
      databasePath,
      env: { PIVOT_MARKETPLACE_CATALOG_ENABLED: '0' },
      fetchImpl,
    })

    expect(runtime.state).toEqual({ available: false, reason: 'unconfigured' })
    expect(existsSync(databasePath)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    runtime.close()
  })

  it.each([
    '',
    'true',
    '2',
    '{"schemaVersion":1}',
  ])('rejects attempts to replace or expand the official trust configuration: %s', (value) => {
    expect(() => resolveMarketplaceProductionCatalogConfig({
      PIVOT_MARKETPLACE_CATALOG_ENABLED: value,
    })).toThrow(/0 or 1/i)
  })

  it('composes the bounded verified reader with only the pinned official source', async () => {
    const snapshot = officialSignedCatalog()
    const databasePath = createDatabasePath()
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(snapshot),
      { headers: { 'content-type': 'application/json' }, status: 200 },
    ))
    const runtime = createMarketplaceProductionCatalogRuntime({
      clock: () => new Date('2026-08-17T00:00:00.000Z'),
      databasePath,
      env: {
        PIVOT_MARKETPLACE_CATALOG_ENABLED: '1',
      },
      fetchImpl,
    })

    expect(runtime.state).toEqual({ available: true, reason: null })
    expect(runtime.reader).not.toBeNull()
    await expect(runtime.reader!.readSnapshot()).resolves.toEqual(snapshot)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(existsSync(databasePath)).toBe(true)
    runtime.close()
    expect(() => runtime.close()).not.toThrow()
  })

  it('rejects an attacker signature even when all official source fields are copied', async () => {
    const snapshot = signedByAttacker()
    const runtime = createMarketplaceProductionCatalogRuntime({
      clock: () => new Date('2026-08-17T00:00:00.000Z'),
      databasePath: createDatabasePath(),
      env: { PIVOT_MARKETPLACE_CATALOG_ENABLED: '1' },
      fetchImpl: async () => new Response(
        JSON.stringify(snapshot),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    })

    await expect(runtime.reader!.readSnapshot()).rejects.toThrow(/signature/i)
    runtime.close()
  })

  it('rejects payload changes made after the official signature was issued', async () => {
    const snapshot = { ...officialSignedCatalog(), revision: 1 }
    const runtime = createMarketplaceProductionCatalogRuntime({
      clock: () => new Date('2026-08-17T00:00:00.000Z'),
      databasePath: createDatabasePath(),
      env: { PIVOT_MARKETPLACE_CATALOG_ENABLED: '1' },
      fetchImpl: async () => new Response(
        JSON.stringify(snapshot),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    })

    await expect(runtime.reader!.readSnapshot()).rejects.toThrow(/signature/i)
    runtime.close()
  })
})

function officialSignedCatalog() {
  const source = {
    catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
    displayName: 'Pivot Marketplace',
    id: 'pivot-official',
    schemaVersion: 1 as const,
    trust: { algorithm: 'ed25519' as const, keyId: 'pivot-marketplace-2026-01' },
  }
  const payload = MarketplaceCatalogPayloadSchema.parse({
    entries: [],
    expiresAt: '2026-08-23T21:25:56.764Z',
    generatedAt: '2026-08-16T21:25:56.764Z',
    revision: 0,
    schemaVersion: 1,
    source,
  })
  return MarketplaceCatalogSnapshotSchema.parse({
    ...payload,
    signature: {
      algorithm: 'ed25519',
      keyId: source.trust.keyId,
      value: 'wzqJAIdTq+Rq/jeHQSzkqIQ+YBztT+BwCNxs+OL7+iVBerFpEmWq5ollHFu9fsb0o5cJq0WU1FDcVvlfrljABw==',
    },
  })
}

function signedByAttacker() {
  const official = officialSignedCatalog()
  const payload = MarketplaceCatalogPayloadSchema.parse({
    entries: official.entries,
    expiresAt: official.expiresAt,
    generatedAt: official.generatedAt,
    revision: official.revision,
    schemaVersion: official.schemaVersion,
    source: official.source,
  })
  const { privateKey } = generateKeyPairSync('ed25519')
  return MarketplaceCatalogSnapshotSchema.parse({
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
}

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-production-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
