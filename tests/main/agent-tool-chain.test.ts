import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalAgentAdapter } from '../../src/main/services/agent-adapters'
import { AgentRuntime } from '../../src/main/services/agent-runtime'
import { DefaultAgentToolExecutor } from '../../src/main/services/agent-tool-executor'
import type { CommandRunner } from '../../src/main/services/command-runner'
import type { AgentFileMutationPort } from '../../src/main/services/agent-tool-ports'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { PermissionManager } from '../../src/main/services/permission-manager'
import { SafeFileWriter } from '../../src/main/services/safe-file-writer'
import type { SignalMap } from '../../src/shared/signal-channel'
import type { CommandRunResult } from '../../src/shared/types/domain'

type SignalRecord = {
  payload: SignalMap[keyof SignalMap]
  signal: keyof SignalMap
}

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-agent-chain-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Agent local tool chain', () => {
  it('routes local fs.readText simulation through permission and the real tool executor', async () => {
    const filePath = path.join(tempRoot, 'README.md')
    await writeFile(filePath, '# Pivot\nhello')
    const { checkpoints, permissions, runtime } = createRuntime()
    const signals: SignalRecord[] = []

    const responsePromise = runtime.send({
      sessionId: 'session-1',
      text: localToolPrompt('fs.readText', { filePath }),
    }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await allowNextPermission(permissions, signals)
    const response = await responsePromise

    expect(response).toContain('Pivot local runtime prepared 1 tool request')
    expect(response).toContain(`Tool fs.readText read ${filePath}.`)
    expect(response).toContain('# Pivot\nhello')
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ toolName: 'fs.readText' }),
      signal: 'permission:request',
    })
    expect(signals.some((item) => item.signal === 'file:changed')).toBe(false)

    checkpoints.close()
  })

  it('routes local fs.search simulation through permission and project search', async () => {
    await mkdir(path.join(tempRoot, 'src'), { recursive: true })
    await mkdir(path.join(tempRoot, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(tempRoot, 'src', 'App.tsx'), 'export function App() {}')
    await writeFile(path.join(tempRoot, 'node_modules', 'pkg', 'App.tsx'), 'ignored')
    const { checkpoints, permissions, runtime } = createRuntime()
    const signals: SignalRecord[] = []

    const responsePromise = runtime.send({
      sessionId: 'session-1',
      text: localToolPrompt('fs.search', { limit: 5, query: 'app', rootPath: tempRoot }),
    }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await allowNextPermission(permissions, signals)
    const response = await responsePromise

    expect(response).toContain('Tool fs.search found 1 result(s) for "app".')
    expect(response).toContain(path.join('src', 'App.tsx'))
    expect(response).not.toContain('node_modules')

    checkpoints.close()
  })

  it('routes local fs.safeWrite simulation through permission, checkpoint, write, and file signal', async () => {
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const canonicalFilePath = await realpath(filePath)
    const checkpoints = new FileCheckpointStore(':memory:')
    const { permissions, runtime } = createRuntime(checkpoints)
    const signals: SignalRecord[] = []

    const responsePromise = runtime.send({
      sessionId: 'session-1',
      text: localToolPrompt('fs.safeWrite', { content: 'after', filePath }),
    }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await allowNextPermission(permissions, signals)
    const response = await responsePromise

    await expect(readFile(filePath, 'utf8')).resolves.toBe('after')
    expect(checkpoints.listForSession('session-1')).toHaveLength(1)
    expect(checkpoints.listForSession('session-1')[0]).toMatchObject({
      content: 'before',
      filePath: canonicalFilePath,
      sessionId: 'session-1',
    })
    expect(response).toContain(`Tool fs.safeWrite modified ${canonicalFilePath}.`)
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ action: 'modify', path: canonicalFilePath }),
      signal: 'file:changed',
    })

    checkpoints.close()
  })

  it('routes local term.run simulation through permission and command runner', async () => {
    const commandResult: CommandRunResult = {
      args: ['test'],
      command: 'npm.cmd',
      cwd: tempRoot,
      exitCode: 0,
      finishedAt: '2026-01-01T00:00:01.000Z',
      outputTruncated: false,
      stderr: '',
      stdout: 'ok',
      timedOut: false,
      timeoutMs: 1000,
      startedAt: '2026-01-01T00:00:00.000Z',
    }
    const { checkpoints, permissions, runtime } = createRuntime(undefined, commandResult)
    const signals: SignalRecord[] = []

    const responsePromise = runtime.send({
      sessionId: 'session-1',
      text: localToolPrompt('term.run', { args: ['test'], command: 'npm.cmd', cwd: tempRoot, timeoutMs: 1000 }),
    }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await allowNextPermission(permissions, signals)
    const response = await responsePromise

    expect(response).toContain('Tool term.run executed npm.cmd test')
    expect(response).toContain('STDOUT:\nok')
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ toolName: 'term.run' }),
      signal: 'permission:request',
    })
    expect(signals.some((item) => item.signal === 'file:changed')).toBe(false)

    checkpoints.close()
  })
})

function createRuntime(
  checkpoints = new FileCheckpointStore(':memory:'),
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
): {
  checkpoints: FileCheckpointStore
  permissions: PermissionManager
  runtime: AgentRuntime
} {
  const permissions = new PermissionManager()
  const runtime = new AgentRuntime({
    adapter: new LocalAgentAdapter({ chunkDelayMs: 0 }),
    permissions,
    tools: new DefaultAgentToolExecutor({
      commandRunner: { run: async () => commandResult } as unknown as CommandRunner,
      fileMutation: legacyTestFileMutation(new SafeFileWriter({ checkpoints })),
      projectRootForSession: () => tempRoot,
    }),
  })

  return { checkpoints, permissions, runtime }
}

function legacyTestFileMutation(writer: SafeFileWriter): AgentFileMutationPort {
  return {
    write: ({ content, filePath, projectRoot, sessionId }) => writer.write(sessionId, projectRoot, filePath, content),
  }
}

function localToolPrompt(toolName: string, input: Record<string, unknown>): string {
  return `@pivot-tool ${toolName} ${JSON.stringify(input)}`
}

async function allowNextPermission(permissions: PermissionManager, signals: SignalRecord[]): Promise<void> {
  await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
  const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
  permissions.resolve(permission.requestId, 'allow')
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error('Timed out waiting for condition')
}
