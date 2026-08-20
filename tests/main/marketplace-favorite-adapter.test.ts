import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MarketplaceFavoriteRevisionConflictError,
  SqliteMarketplaceFavoriteAdapter,
} from '../../src/main/services/sqlite-marketplace-favorite-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('SQLite marketplace favorite adapter', () => {
  it('creates a versioned migration and exposes only frozen narrow capabilities', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteMarketplaceFavoriteAdapter({
      databasePath,
      now: () => '2026-08-11T00:00:00.000Z',
    })

    const reader = adapter.openReaderPort()
    const writer = adapter.openWriterPort()
    expect(reader.getFavorites()).toEqual({
      items: [],
      revision: 0,
      schemaVersion: 1,
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
    expect(Object.keys(reader)).toEqual(['getFavorites'])
    expect(Object.keys(writer)).toEqual(['setFavorite'])
    expect(Object.isFrozen(reader)).toBe(true)
    expect(Object.isFrozen(writer)).toBe(true)
    adapter.close()

    const db = new Database(databasePath, { readonly: true })
    expect(db.prepare('SELECT version FROM marketplace_favorite_migrations').all()).toEqual([{ version: 1 }])
    db.close()
  })

  it('persists add and remove operations across restart', () => {
    const databasePath = createDatabasePath()
    const first = new SqliteMarketplaceFavoriteAdapter({
      databasePath,
      now: () => '2026-08-11T00:01:00.000Z',
    })
    const added = first.openWriterPort().setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'theme',
      resourceId: 'dev.pivot.dracula',
      sourceId: 'official',
    })
    expect(added).toMatchObject({ revision: 1, items: [{ resourceId: 'dev.pivot.dracula' }] })
    first.close()

    const reopened = new SqliteMarketplaceFavoriteAdapter({
      databasePath,
      now: () => '2026-08-11T00:02:00.000Z',
    })
    expect(reopened.openReaderPort().getFavorites()).toEqual(added)
    const removed = reopened.openWriterPort().setFavorite({
      expectedRevision: 1,
      favorite: false,
      kind: 'theme',
      resourceId: 'dev.pivot.dracula',
      sourceId: 'official',
    })
    expect(removed).toMatchObject({ items: [], revision: 2 })
    reopened.close()

    const final = new SqliteMarketplaceFavoriteAdapter({ databasePath })
    expect(final.openReaderPort().getFavorites()).toEqual(removed)
    final.close()
  })

  it('rejects stale revisions without changing persisted favorites', () => {
    const adapter = new SqliteMarketplaceFavoriteAdapter({ databasePath: createDatabasePath() })
    const writer = adapter.openWriterPort()
    const added = writer.setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      sourceId: 'official',
    })
    expect(() => writer.setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'prompt',
      resourceId: 'dev.pivot.api-docs',
      sourceId: 'official',
    })).toThrow(MarketplaceFavoriteRevisionConflictError)
    expect(adapter.openReaderPort().getFavorites()).toEqual(added)
    adapter.close()
  })

  it('rejects a stale writer opened by another adapter instance', () => {
    const databasePath = createDatabasePath()
    const first = new SqliteMarketplaceFavoriteAdapter({ databasePath })
    const second = new SqliteMarketplaceFavoriteAdapter({ databasePath })
    first.openWriterPort().setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      sourceId: 'official',
    })
    expect(() => second.openWriterPort().setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'theme',
      resourceId: 'dev.pivot.dracula',
      sourceId: 'official',
    })).toThrow(MarketplaceFavoriteRevisionConflictError)
    expect(second.openReaderPort().getFavorites().items).toHaveLength(1)
    first.close()
    second.close()
  })

  it('treats an already-satisfied write as an idempotent no-op', () => {
    const adapter = new SqliteMarketplaceFavoriteAdapter({ databasePath: createDatabasePath() })
    const writer = adapter.openWriterPort()
    const added = writer.setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'plugin',
      resourceId: 'dev.pivot.git-flow',
      sourceId: 'official',
    })
    expect(writer.setFavorite({
      expectedRevision: 1,
      favorite: true,
      kind: 'plugin',
      resourceId: 'dev.pivot.git-flow',
      sourceId: 'official',
    })).toEqual(added)
    adapter.close()
  })

  it('fails closed when persisted favorite rows are corrupted', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteMarketplaceFavoriteAdapter({ databasePath })
    adapter.openWriterPort().setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'skill',
      resourceId: 'dev.pivot.react-reviewer',
      sourceId: 'official',
    })
    adapter.close()

    const db = new Database(databasePath)
    db.prepare("UPDATE marketplace_favorites SET kind = 'executable'").run()
    db.close()

    const reopened = new SqliteMarketplaceFavoriteAdapter({ databasePath })
    expect(() => reopened.openReaderPort().getFavorites()).toThrow(/invalid persisted marketplace favorites/i)
    reopened.close()
  })
})

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-favorites-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
