import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis project binding module boundaries', () => {
  it('keeps contracts shared, persistence in Main, and consumers on the Reader Port', async () => {
    const contracts = await source('shared/axis-project-binding-contracts.ts')
    const ports = await source('main/services/axis-project-binding-ports.ts')
    const store = await source('main/services/sqlite-axis-project-binding-store.ts')
    const identity = await source('main/services/axis-project-file-identity.ts')
    const fingerprint = await source('main/services/axis-external-file-fingerprint-adapter.ts')
    const authority = await source('main/services/axis-execution-authority.ts')
    const guardedWrite = await source('main/services/axis-guarded-safe-write.ts')
    const lifecycle = await source('main/services/axis-run-lease-lifecycle.ts')
    const worker = await source('main/services/axis-safe-write-worker.ts')

    expect(contracts).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contracts).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow/)
    expect(ports).toContain("from '../../shared/axis-project-binding-contracts'")
    expect(ports).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(store).toContain('AxisProjectBindingPortFactory')
    expect(store).toContain('better-sqlite3')
    expect(store).not.toMatch(/ipcMain|BrowserWindow|renderer\//)

    for (const consumer of [identity, fingerprint, authority, guardedWrite]) {
      expect(consumer).toContain('AxisProjectBindingReaderPort')
      expect(consumer).not.toContain('projectRootForSession')
      expect(consumer).not.toContain('SqliteAxisProjectBindingStore')
    }
    expect(lifecycle).toContain("Pick<")
    expect(lifecycle).toContain("'releaseForRun' | 'releaseForSession'")
    expect(lifecycle).not.toMatch(/SqliteAxisFileLeaseStore|better-sqlite3|node:fs|renderer\//)
    expect(worker).not.toMatch(/AxisProjectBinding|projectBindings|better-sqlite3|node:fs/)
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
