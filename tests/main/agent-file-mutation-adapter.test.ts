import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DefaultAgentToolExecutor } from '../../src/main/services/agent-tool-executor'
import { GuardedAgentFileMutationRequiredAdapter } from '../../src/main/services/guarded-agent-file-mutation-required-adapter'

describe('GuardedAgentFileMutationRequiredAdapter', () => {
  it('fails closed instead of routing an ordinary Agent write through the legacy writer', async () => {
    const adapter = new GuardedAgentFileMutationRequiredAdapter()

    await expect(adapter.write({
      content: 'unreviewed',
      filePath: 'D:\\Project\\Pivot\\src\\unsafe.ts',
      projectRoot: 'D:\\Project\\Pivot',
      sessionId: 'session-1',
    })).rejects.toThrow('reviewed Guarded Safe Write')
  })

  it('preserves the real file when an ordinary Agent reaches the rejected write path', async () => {
    const projectRoot = path.join(os.tmpdir(), `pivot-rejected-agent-write-${Date.now()}`)
    const filePath = path.join(projectRoot, 'source.ts')
    await mkdir(projectRoot, { recursive: true })
    await writeFile(filePath, 'trusted baseline')
    const executor = new DefaultAgentToolExecutor({
      commandRunner: { run: async () => { throw new Error('not used') } },
      fileMutation: new GuardedAgentFileMutationRequiredAdapter(),
      projectRootForSession: () => projectRoot,
    })

    try {
      await expect(executor.execute({
        input: { content: 'unreviewed mutation', filePath },
        sessionId: 'session-1',
        toolName: 'fs.safeWrite',
      })).rejects.toThrow('reviewed Guarded Safe Write')
      await expect(readFile(filePath, 'utf8')).resolves.toBe('trusted baseline')
    } finally {
      await rm(projectRoot, { force: true, recursive: true })
    }
  })
})
