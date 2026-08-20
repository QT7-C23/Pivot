import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis external file fingerprint module boundaries', () => {
  it('keeps contracts shared, task Ports narrow, and filesystem access in the Main adapter', async () => {
    const contracts = await source('shared/axis-file-fingerprint-contracts.ts')
    const ports = await source('main/services/axis-file-fingerprint-ports.ts')
    const adapter = await source('main/services/axis-external-file-fingerprint-adapter.ts')

    expect(contracts).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contracts).not.toMatch(/node:fs|node:path|node:crypto|better-sqlite3|ipcMain|BrowserWindow/)
    expect(ports).toContain("from '../../shared/axis-file-fingerprint-contracts'")
    expect(ports).not.toMatch(/node:fs|node:path|better-sqlite3|ipcMain|BrowserWindow|renderer\//)
    expect(ports).toContain('AxisTaskFileFingerprintPort')
    expect(ports).toContain('AxisFileFingerprintPortFactory')
    expect(ports).not.toMatch(/AdminPort|database|shared_data|globalThis/)
    expect(adapter).toContain("from './axis-file-fingerprint-ports'")
    expect(adapter).toContain("from 'node:fs/promises'")
    expect(adapter).toContain('AxisProjectFileIdentityPort')
    expect(adapter).not.toMatch(/better-sqlite3|ipcMain|BrowserWindow|renderer\/|shared_data|globalThis/)
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
