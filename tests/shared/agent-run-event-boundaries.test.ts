import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (filePath: string): string => readFileSync(path.resolve(filePath), 'utf8')

describe('Agent run event boundaries', () => {
  it('keeps the shared event contract independent of Main, Renderer and infrastructure', () => {
    const contract = source('src/shared/agent-run-events.ts')
    const ports = source('src/main/services/agent-run-event-ports.ts')

    expect(contract).not.toMatch(/src\/main|src\/renderer|electron|better-sqlite3|node:fs/)
    expect(ports).toContain("from '../../shared/agent-run-events'")
    expect(ports).not.toMatch(/better-sqlite3|node:fs|AgentRuntime|ipcMain|renderer\//)
  })

  it('injects only the writer Port into AgentRuntime from the application composition root', () => {
    const runtime = source('src/main/services/agent-runtime.ts')
    const root = source('src/main/ipc-handlers.ts')

    expect(runtime).toContain('AgentRunEventWriterPort')
    expect(runtime).not.toMatch(/SqliteAgentRunEventAdapter|better-sqlite3|Database\(/)
    expect(root).toContain("new SqliteAgentRunEventAdapter({ databasePath: options.databasePath })")
    expect(root).toMatch(/new AgentRuntime\(\{[\s\S]*events: agentRunEvents\.openWriterPort\(\)/)
  })

  it('wires the narrow lifecycle Port into permanent deletion and closes the concrete adapter', () => {
    const root = source('src/main/ipc-handlers.ts')

    expect(root).toMatch(/ownedData:\s*\[[\s\S]*agentRunEvents\.openLifecyclePort\(\)/)
    expect(root).toMatch(/resources:\s*\[[\s\S]*agentRunEvents/)
  })
})
