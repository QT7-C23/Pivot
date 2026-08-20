import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DefaultAgentToolExecutor } from '../../src/main/services/agent-tool-executor'
import type { CommandRunner } from '../../src/main/services/command-runner'
import type { AgentFileMutationPort } from '../../src/main/services/agent-tool-ports'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { SafeFileWriter } from '../../src/main/services/safe-file-writer'
import type { CommandRunResult } from '../../src/shared/types/domain'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-agent-tools-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('DefaultAgentToolExecutor', () => {
  it('executes fs.readText through the file-system boundary', async () => {
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'export const answer = 42')
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    const result = await executor.execute({
      input: { filePath },
      sessionId: 'session-1',
      toolName: 'fs.readText',
    })

    expect(result).toEqual({
      text: [
        `Tool fs.readText read ${filePath}.`,
        'Content length: 24 characters.',
        '',
        'export const answer = 42',
      ].join('\n'),
    })

    checkpoints.close()
  })

  it('rejects agent file and command paths outside the session project', async () => {
    const outsideRoot = `${tempRoot}-outside`
    await mkdir(outsideRoot, { recursive: true })
    const outsideFile = path.join(outsideRoot, 'secret.txt')
    await writeFile(outsideFile, 'secret')
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    await expect(executor.execute({
      input: { filePath: outsideFile },
      sessionId: 'session-1',
      toolName: 'fs.readText',
    })).rejects.toThrow('outside the project root')
    await expect(executor.execute({
      input: { command: 'node', cwd: outsideRoot },
      sessionId: 'session-1',
      toolName: 'term.run',
    })).rejects.toThrow('outside the project root')

    checkpoints.close()
    await rm(outsideRoot, { recursive: true, force: true })
  })

  it('executes fs.search through the project search boundary', async () => {
    await mkdir(path.join(tempRoot, 'src'), { recursive: true })
    await mkdir(path.join(tempRoot, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(tempRoot, 'src', 'App.tsx'), 'export function App() {}')
    await writeFile(path.join(tempRoot, 'node_modules', 'pkg', 'App.tsx'), 'ignored')
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    const result = await executor.execute({
      input: { limit: 5, query: 'app', rootPath: tempRoot },
      sessionId: 'session-1',
      toolName: 'fs.search',
    })

    expect(result.text).toContain('Tool fs.search found 1 result(s) for "app".')
    expect(result.text).toContain(path.join('src', 'App.tsx'))
    expect(result.text).not.toContain('node_modules')

    checkpoints.close()
  })

  it('executes fs.safeWrite through the safe file writer', async () => {
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    const result = await executor.execute({
      input: { content: 'after', filePath },
      sessionId: 'session-1',
      toolName: 'fs.safeWrite',
    })
    const canonicalFilePath = await realpath(filePath)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('after')
    expect(result).toMatchObject({
      changedFilePath: canonicalFilePath,
      fileAction: 'modify',
    })
    expect(result.text).toContain('Tool fs.safeWrite modified')
    expect(checkpoints.listForSession('session-1')).toHaveLength(1)

    checkpoints.close()
  })

  it('rejects unsupported tools', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    await expect(executor.execute({
      input: {},
      sessionId: 'session-1',
      toolName: 'shell.exec',
    })).rejects.toThrow('Unsupported agent tool: shell.exec')

    checkpoints.close()
  })

  it('rejects invalid fs.safeWrite input before touching files', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    await expect(executor.execute({
      input: { content: 'after' },
      sessionId: 'session-1',
      toolName: 'fs.safeWrite',
    })).rejects.toThrow('Expected agent tool input "filePath" to be a non-empty string')

    checkpoints.close()
  })

  it('rejects invalid fs.search limits', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    await expect(executor.execute({
      input: { limit: 0, query: 'app', rootPath: tempRoot },
      sessionId: 'session-1',
      toolName: 'fs.search',
    })).rejects.toThrow('Expected agent tool input "limit" to be a positive integer')

    checkpoints.close()
  })

  it('executes term.run through the command runner boundary', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints, {
      args: ['test'],
      command: 'npm.cmd',
      cwd: tempRoot,
      exitCode: 0,
      finishedAt: '2026-01-01T00:00:01.000Z',
      outputTruncated: false,
      stderr: '',
      stdout: 'ok',
      timedOut: false,
      timeoutMs: 5000,
      startedAt: '2026-01-01T00:00:00.000Z',
    })

    const result = await executor.execute({
      input: { args: ['test'], command: 'npm.cmd', cwd: tempRoot, timeoutMs: 5000 },
      sessionId: 'session-1',
      toolName: 'term.run',
    })

    expect(result.text).toContain('Tool term.run executed npm.cmd test')
    expect(result.text).toContain(`CWD: ${tempRoot}`)
    expect(result.text).toContain('Exit code: 0')
    expect(result.text).toContain('STDOUT:\nok')
    expect(result.text).toContain('STDERR:\n(empty)')

    checkpoints.close()
  })

  it('rejects invalid term.run args', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const executor = createExecutor(checkpoints)

    await expect(executor.execute({
      input: { args: 'test', command: 'npm.cmd', cwd: tempRoot },
      sessionId: 'session-1',
      toolName: 'term.run',
    })).rejects.toThrow('Expected agent tool input "args" to be a string array')

    checkpoints.close()
  })
})

function createExecutor(
  checkpoints: FileCheckpointStore,
  commandResult: CommandRunResult = {
    args: [],
    command: 'node',
    cwd: tempRoot,
    exitCode: 0,
    finishedAt: '2026-01-01T00:00:01.000Z',
    outputTruncated: false,
    stderr: '',
    stdout: '',
    timedOut: false,
    timeoutMs: 30000,
    startedAt: '2026-01-01T00:00:00.000Z',
  },
): DefaultAgentToolExecutor {
  return new DefaultAgentToolExecutor({
    commandRunner: { run: async () => commandResult } as unknown as CommandRunner,
    fileMutation: legacyTestFileMutation(new SafeFileWriter({ checkpoints })),
    projectRootForSession: () => tempRoot,
  })
}

function legacyTestFileMutation(writer: SafeFileWriter): AgentFileMutationPort {
  return {
    write: ({ content, filePath, projectRoot, sessionId }) => writer.write(sessionId, projectRoot, filePath, content),
  }
}
