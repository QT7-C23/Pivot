import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis file lease module boundaries', () => {
  it('separates shared contracts, Ports, path identity, and SQLite storage', async () => {
    const contracts = await source('shared/axis-file-lease-contracts.ts')
    const ports = await source('main/services/axis-file-lease-ports.ts')
    const identity = await source('main/services/axis-project-file-identity.ts')
    const store = await source('main/services/sqlite-axis-file-lease-store.ts')

    expect(contracts).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contracts).not.toMatch(/better-sqlite3|node:fs|node:path|ipcMain|BrowserWindow/)
    expect(ports).toContain("from '../../shared/axis-file-lease-contracts'")
    expect(ports).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(ports).toContain('AxisTaskFileLeasePort')
    expect(ports).toContain('AxisFileLeaseCoordinatorPort')
    expect(ports).toContain('AxisFileLeaseAdminPort')
    expect(identity).toContain('resolvePathWithinRoot')
    expect(identity).not.toMatch(/better-sqlite3|ipcMain|BrowserWindow|renderer\//)
    expect(store).toContain("from './axis-file-lease-ports'")
    expect(store).not.toMatch(/resolvePathWithinRoot|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(store).not.toMatch(/shared_data|globalThis/)
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
