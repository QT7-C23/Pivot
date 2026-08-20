import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('application preferences Main IPC boundary', () => {
  it('constructs the concrete adapter only in Main composition and closes it', () => {
    const handlers = readFileSync(path.resolve('src/main/ipc-handlers.ts'), 'utf8')
    const preload = readFileSync(path.resolve('src/main/preload.ts'), 'utf8')
    const shutdown = readFileSync(path.resolve('src/main/ipc-runtime-shutdown.ts'), 'utf8')
    expect(handlers).toContain('new SqliteApplicationPreferencesAdapter')
    expect(handlers).toContain("handle('settings:application-preferences'")
    expect(handlers).toContain("handle('settings:update-application-preferences'")
    expect(handlers).toMatch(/resources:\s*\[[\s\S]*applicationPreferences/)
    expect(shutdown).toContain('resource?.close()')
    expect(preload).not.toContain('SqliteApplicationPreferencesAdapter')
    expect(preload).not.toContain('better-sqlite3')
  })
})
