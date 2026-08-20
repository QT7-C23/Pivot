import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('plugin and external runtime module boundaries', () => {
  it('keeps contracts pure and free of execution authority', async () => {
    const contract = await readFile(path.resolve('src/shared/plugin-runtime-contracts.ts'), 'utf8')
    const grantService = await readFile(path.resolve('src/main/services/plugin-capability-grant-service.ts'), 'utf8')

    expect(contract).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contract).not.toMatch(/node:(fs|child_process|net|http|https)|better-sqlite3|Electron|ipcMain|BrowserWindow/)
    expect(contract).not.toMatch(/spawn\(|exec\(|writeFile\(|unlink\(/)
    expect(contract).toContain("issuedBy: z.literal('pivot-main')")
    expect(contract).toContain("mode: z.literal('runtime-grant')")
    expect(contract).toContain('free: z.literal(true)')
    expect(grantService).toContain("from '../../shared/plugin-runtime-contracts'")
    expect(grantService).toContain("issuedBy: 'pivot-main'")
    expect(grantService).not.toMatch(/renderer\/|ipcMain|BrowserWindow|node:(fs|child_process|net|http|https)|better-sqlite3/)
  })
})
