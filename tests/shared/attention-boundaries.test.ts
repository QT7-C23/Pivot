import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')

describe('durable Attention capability boundaries', () => {
  it('keeps strict contracts in shared and infrastructure behind narrow Ports', () => {
    const contract = readFileSync(path.join(root, 'shared/attention.ts'), 'utf8')
    const ports = readFileSync(path.join(root, 'main/services/attention-ports.ts'), 'utf8')
    expect(contract).not.toMatch(/node:fs|better-sqlite3|ipcMain|BrowserWindow|renderer\//)
    expect(ports).toContain('AttentionReaderPort')
    expect(ports).toContain('AttentionObservationPort')
    expect(ports).toContain('AttentionLifecyclePort')
    expect(ports).not.toMatch(/better-sqlite3|BrowserWindow|ipcMain|renderer\//)
  })

  it('does not grant Renderer filesystem, database or Admin capabilities', () => {
    const center = readFileSync(path.join(root, 'renderer/components/attention-center.tsx'), 'utf8')
    const client = readFileSync(path.join(root, 'renderer/services/attention-client.ts'), 'utf8')
    expect(`${center}\n${client}`).not.toMatch(/node:fs|better-sqlite3|Database|AdminPort|dialog|showOpenDialog/)
    expect(client).toContain('AttentionClientPort')
    expect(client).toContain('AttentionRecordSchema.parse')
    expect(client).toContain('AttentionHistorySchema.parse')
  })

  it('constructs and closes the concrete Adapter only in Main composition', () => {
    const handlers = readFileSync(path.join(root, 'main/ipc-handlers.ts'), 'utf8')
    const preload = readFileSync(path.join(root, 'main/preload.ts'), 'utf8')
    const shutdown = readFileSync(path.join(root, 'main/ipc-runtime-shutdown.ts'), 'utf8')
    expect(handlers).toContain('new SqliteAttentionAdapter')
    expect(handlers).toContain('attention.openReaderPort()')
    expect(handlers).toContain('attention.openObservationPort()')
    expect(handlers).toContain('attention.openLifecyclePort()')
    expect(handlers).toMatch(/resources:\s*\[[\s\S]*attention/)
    expect(shutdown).toContain('resource?.close()')
    expect(preload).not.toContain('SqliteAttentionAdapter')
  })
})
