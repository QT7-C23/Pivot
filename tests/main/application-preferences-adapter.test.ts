import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_APPLICATION_PREFERENCE_VALUES } from '../../src/shared/application-preferences'
import {
  ApplicationPreferencesRevisionConflictError,
  SqliteApplicationPreferencesAdapter,
} from '../../src/main/services/sqlite-application-preferences-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('SQLite application preferences adapter', () => {
  it('creates a versioned migration and returns strict defaults', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteApplicationPreferencesAdapter({
      databasePath,
      now: () => '2026-08-02T00:00:00.000Z',
    })

    expect(adapter.openReaderPort().get()).toEqual({
      revision: 0,
      schemaVersion: 2,
      updatedAt: '2026-08-02T00:00:00.000Z',
      values: DEFAULT_APPLICATION_PREFERENCE_VALUES,
    })
    adapter.close()

    const db = new Database(databasePath, { readonly: true })
    expect(db.prepare('SELECT version FROM application_preferences_migrations').all()).toEqual([{ version: 1 }, { version: 2 }])
    db.close()
  })

  it('persists exact updates across restart and rejects stale revisions', () => {
    const databasePath = createDatabasePath()
    const first = new SqliteApplicationPreferencesAdapter({
      databasePath,
      now: () => '2026-08-02T00:01:00.000Z',
    })
    const writer = first.openWriterPort()
    const updated = writer.update({
      expectedRevision: 0,
      patch: {
        dateFormat: 'dd-mm-yyyy',
        notificationLevel: 'all',
        restoreSessions: false,
        theme: 'dark',
      },
    })
    expect(updated.revision).toBe(1)
    expect(updated.values.dateFormat).toBe('dd-mm-yyyy')
    expect(updated.values.theme).toBe('dark')
    expect(() => writer.update({
      expectedRevision: 0,
      patch: { startMinimized: true },
    })).toThrow(ApplicationPreferencesRevisionConflictError)
    expect(first.openReaderPort().get().values.startMinimized).toBe(false)
    first.close()

    const reopened = new SqliteApplicationPreferencesAdapter({ databasePath })
    expect(reopened.openReaderPort().get()).toEqual(updated)
    reopened.close()
  })

  it('migrates a v1 preference row and preserves user values across restart', () => {
    const databasePath = createDatabasePath()
    const first = new SqliteApplicationPreferencesAdapter({ databasePath })
    first.close()
    const db = new Database(databasePath)
    db.prepare('DELETE FROM application_preferences_migrations WHERE version = 2').run()
    db.prepare('UPDATE application_preferences SET schema_version = 1, value_json = ? WHERE id = 1').run(JSON.stringify({
      dateFormat: 'dd-mm-yyyy',
      locale: 'zh-CN',
      notificationLevel: 'all',
      openOnLaunch: 'home',
      restoreSessions: false,
      sessionTimeout: '60',
      startMinimized: true,
      timeFormat: '12',
    }))
    db.close()

    const migrated = new SqliteApplicationPreferencesAdapter({ databasePath })
    expect(migrated.openReaderPort().get()).toMatchObject({
      schemaVersion: 2,
      values: {
        dateFormat: 'dd-mm-yyyy',
        locale: 'zh-CN',
        theme: 'light',
      },
    })
    migrated.close()
  })

  it('fails closed when persisted JSON is corrupted', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteApplicationPreferencesAdapter({ databasePath })
    adapter.close()
    const db = new Database(databasePath)
    db.prepare("UPDATE application_preferences SET value_json = '{bad-json' WHERE id = 1").run()
    db.close()

    const reopened = new SqliteApplicationPreferencesAdapter({ databasePath })
    expect(() => reopened.openReaderPort().get()).toThrow(/invalid persisted application preferences/i)
    reopened.close()
  })

  it('exposes frozen read and write capabilities without close or database access', () => {
    const adapter = new SqliteApplicationPreferencesAdapter({ databasePath: createDatabasePath() })
    const reader = adapter.openReaderPort()
    const writer = adapter.openWriterPort()
    expect(Object.keys(reader)).toEqual(['get'])
    expect(Object.keys(writer)).toEqual(['update'])
    expect(Object.isFrozen(reader)).toBe(true)
    expect(Object.isFrozen(writer)).toBe(true)
    adapter.close()
  })
})

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-application-preferences-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
