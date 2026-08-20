import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: () => null,
    getAllWindows: () => [],
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
  ipcMain: {
    handle(channel: string, handler: (event: unknown, request: unknown) => unknown) {
      electron.handlers.set(channel, handler)
    },
  },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    isEncryptionAvailable: () => true,
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
    showItemInFolder: vi.fn(),
  },
}))

import { registerIpcHandlers, type IpcRuntimeResources } from '../../src/main/ipc-handlers'

const roots: string[] = []
let originalEnabled: string | undefined
let runtime: IpcRuntimeResources | null = null

beforeEach(() => {
  electron.handlers.clear()
  originalEnabled = process.env['PIVOT_MARKETPLACE_CATALOG_ENABLED']
  delete process.env['PIVOT_MARKETPLACE_CATALOG_ENABLED']
})

afterEach(() => {
  runtime?.close()
  runtime = null
  if (originalEnabled === undefined) delete process.env['PIVOT_MARKETPLACE_CATALOG_ENABLED']
  else process.env['PIVOT_MARKETPLACE_CATALOG_ENABLED'] = originalEnabled
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace production Main composition', () => {
  it('registers no Catalog persistence while the production trust source is unconfigured', async () => {
    const databasePath = createDatabasePath()
    runtime = registerIpcHandlers({ databasePath })
    await runtime.ready
    await runtime.close()
    runtime = null

    expect(tableNames(databasePath)).not.toContain('marketplace_catalog_cache_migrations')
  })

  it('constructs and owns the configured Catalog cache in the registered Main lifecycle', async () => {
    const databasePath = createDatabasePath()
    const userDataPath = path.dirname(databasePath)
    process.env['PIVOT_MARKETPLACE_CATALOG_ENABLED'] = '1'
    runtime = registerIpcHandlers({ databasePath, userDataPath })
    await runtime.ready
    await runtime.close()
    runtime = null

    expect(tableNames(databasePath)).toContain('marketplace_catalog_cache_migrations')
    expect(tableNames(databasePath)).toContain('marketplace_installation_migrations')
    expect(electron.handlers.has('marketplace:installations')).toBe(true)
    expect(electron.handlers.has('marketplace:install')).toBe(true)
    expect(electron.handlers.has('marketplace:uninstall')).toBe(true)
    expect(() => {
      const db = new Database(databasePath)
      db.close()
    }).not.toThrow()
  })
})

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-composition-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}

function tableNames(databasePath: string): string[] {
  const db = new Database(databasePath, { readonly: true })
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as { name: unknown }).name))
  } finally {
    db.close()
  }
}
