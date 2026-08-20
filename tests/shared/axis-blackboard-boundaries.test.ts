import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis blackboard module boundaries', () => {
  it('separates shared contracts, narrow ports, and SQLite implementation', async () => {
    const contracts = await source('shared/axis-blackboard-contracts.ts')
    const ports = await source('main/services/axis-blackboard-ports.ts')
    const store = await source('main/services/sqlite-axis-blackboard-store.ts')

    expect(contracts).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contracts).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow/)
    expect(ports).toContain("from '../../shared/axis-blackboard-contracts'")
    expect(ports).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(ports).toContain('AxisBlackboardReaderPort')
    expect(ports).toContain('AxisBlackboardWriterPort')
    expect(ports).toContain('AxisBlackboardAdminPort')
    expect(store).toContain("from './axis-blackboard-ports'")
    expect(store).not.toMatch(/ipcMain|BrowserWindow|renderer\//)
    expect(store).not.toMatch(/shared_data|globalThis/)
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
