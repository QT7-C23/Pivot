import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis trusted Gate profile boundaries', () => {
  it('keeps profile data strict in Shared and resolution capability in Main only', async () => {
    const contract = await source('shared/axis-gate-profile-contracts.ts')
    const port = await source('main/services/axis-gate-profile-port.ts')
    const adapter = await source('main/services/axis-trusted-gate-profile-adapter.ts')
    const guarded = await source('main/services/axis-guarded-safe-write.ts')
    const runner = await source('main/services/axis-gate-runner.ts')

    expect(contract).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(port).toContain('AxisGateProfilePort')
    expect(port).not.toMatch(/node:fs|better-sqlite3|BrowserWindow|ipcMain|renderer\//)
    expect(adapter).toContain('implements AxisGateProfilePort')
    expect(adapter).not.toMatch(/BrowserWindow|ipcMain|renderer\//)
    expect(guarded).toContain('this.gates.supports(input.projectRoot, input.sessionId, task.requiredGates)')
    expect(runner).toContain('profiles.resolve({')
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
