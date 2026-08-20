import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Renderer command capability boundaries', () => {
  it('does not expose a programmatic command-run IPC or Renderer convenience API', async () => {
    const ipc = await readFile(path.resolve('src/shared/types/ipc.ts'), 'utf8')
    const validation = await readFile(path.resolve('src/shared/ipc-validation.ts'), 'utf8')
    const handlers = await readFile(path.resolve('src/main/ipc-handlers.ts'), 'utf8')
    const renderer = await readFile(path.resolve('src/renderer/services/terminal.service.ts'), 'utf8')

    for (const source of [ipc, validation, handlers, renderer]) {
      expect(source).not.toContain('term:run')
    }
    expect(renderer).not.toContain('CommandRunResult')
  })

  it('retains interactive terminal channels and the internal Agent command Port', async () => {
    const ipc = await readFile(path.resolve('src/shared/types/ipc.ts'), 'utf8')
    const agentPorts = await readFile(path.resolve('src/main/services/agent-tool-ports.ts'), 'utf8')

    for (const channel of ['term:create', 'term:write', 'term:resize', 'term:destroy']) {
      expect(ipc).toContain(channel)
    }
    expect(agentPorts).toContain('AgentCommandRunPort')
  })
})
