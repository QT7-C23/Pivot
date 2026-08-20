import Database from 'better-sqlite3'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MarketplaceCatalogPayloadSchema,
  MarketplaceCatalogSnapshotSchema,
  serializeMarketplaceCatalogPayload,
} from '../../src/shared/marketplace-contracts'
import { SqliteMarketplaceCatalogCacheAdapter } from '../../src/main/services/sqlite-marketplace-catalog-cache-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('SQLite Marketplace Catalog cache adapter', () => {
  it('creates a versioned migration and exposes frozen narrow Ports', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteMarketplaceCatalogCacheAdapter({ databasePath })
    expect(Object.keys(adapter.openReaderPort())).toEqual(['read'])
    expect(Object.keys(adapter.openWriterPort())).toEqual(['write'])
    expect(Object.keys(adapter.openPort())).toEqual(['read', 'write'])
    expect(Object.isFrozen(adapter.openPort())).toBe(true)
    adapter.close()

    const db = new Database(databasePath, { readonly: true })
    expect(db.prepare('SELECT version FROM marketplace_catalog_cache_migrations').all()).toEqual([{ version: 1 }])
    db.close()
  })

  it('fails closed when persisted JSON or row identity is corrupted', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteMarketplaceCatalogCacheAdapter({ databasePath })
    adapter.openWriterPort().write(createSnapshot())
    adapter.close()

    const db = new Database(databasePath)
    db.prepare("UPDATE marketplace_catalog_cache SET snapshot_json = '{bad-json'").run()
    db.close()
    const reopened = new SqliteMarketplaceCatalogCacheAdapter({ databasePath })
    expect(() => reopened.openReaderPort().read('official')).toThrow(/invalid persisted marketplace catalog/i)
    reopened.close()
  })

  it('refuses revision downgrade and same-revision payload replacement', () => {
    const adapter = new SqliteMarketplaceCatalogCacheAdapter({ databasePath: createDatabasePath() })
    const current = createSnapshot(2, 'Pivot Official')
    adapter.openWriterPort().write(current)

    expect(() => adapter.openWriterPort().write(createSnapshot(1, 'Pivot Official')))
      .toThrow(/rollback|revision/i)
    expect(() => adapter.openWriterPort().write(createSnapshot(2, 'Pivot Mirror')))
      .toThrow(/revision|equivocation/i)
    expect(adapter.openReaderPort().read('official')).toEqual(current)
    adapter.close()
  })
})

function createSnapshot(revision = 1, displayName = 'Pivot Official') {
  const { privateKey } = generateKeyPairSync('ed25519')
  const payload = MarketplaceCatalogPayloadSchema.parse({
    entries: [],
    expiresAt: '2026-08-12T00:00:00.000Z',
    generatedAt: '2026-08-11T00:00:00.000Z',
    revision,
    schemaVersion: 1,
    source: {
      catalogUrl: 'https://catalog.pivot.invalid/catalog.json',
      displayName,
      id: 'official',
      schemaVersion: 1,
      trust: { algorithm: 'ed25519', keyId: 'pivot-official-2026' },
    },
  })
  return MarketplaceCatalogSnapshotSchema.parse({
    ...payload,
    signature: {
      algorithm: 'ed25519',
      keyId: 'pivot-official-2026',
      value: sign(null, Buffer.from(serializeMarketplaceCatalogPayload(payload)), privateKey).toString('base64'),
    },
  })
}

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-cache-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
