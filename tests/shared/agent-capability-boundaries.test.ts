import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ordinary Agent capability boundaries', () => {
  it('makes the tool executor depend on narrow Ports rather than infrastructure implementations', async () => {
    const source = await readFile(path.resolve('src/main/services/agent-tool-executor.ts'), 'utf8')

    expect(source).toContain("from './agent-tool-ports'")
    expect(source).not.toContain("from './command-runner'")
    expect(source).not.toContain("from './safe-file-writer'")
    expect(source).not.toContain('SafeFileWriter')
  })

  it('keeps production ordinary-Agent writes fail-closed until the Guarded adapter is wired', async () => {
    const source = await readFile(path.resolve('src/main/ipc-handlers.ts'), 'utf8')
    const construction = source.match(/const agentTools = new DefaultAgentToolExecutor\(\{([\s\S]*?)\n  \}\)/)?.[1]

    expect(source).toContain('new GuardedAgentFileMutationRequiredAdapter()')
    expect(construction).toBeDefined()
    expect(construction).not.toContain('safeFileWriter')
  })
})
