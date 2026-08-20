import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  CliAgentAdapter,
  createAgentAdapterFromEnvironment,
  LocalAgentAdapter,
} from '../../src/main/services/agent-adapters'
import type { AgentAdapterEvent } from '../../src/main/services/agent-events'

class FakeChildProcess extends EventEmitter {
  killed = false
  stderr = new PassThrough()
  stdin = new PassThrough()
  stdout = new PassThrough()

  kill(): void {
    this.killed = true
    this.emit('close', null)
  }
}

async function collectText(stream: AsyncIterable<AgentAdapterEvent>): Promise<string> {
  let output = ''
  for await (const event of stream) {
    if (event.type === 'text') {
      output += event.text
    }
  }
  return output
}

async function collectEvents(stream: AsyncIterable<AgentAdapterEvent>): Promise<AgentAdapterEvent[]> {
  const events: AgentAdapterEvent[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe('agent adapters', () => {
  it('uses local adapter when no CLI command is configured', () => {
    const adapter = createAgentAdapterFromEnvironment({})

    expect(adapter).toBeInstanceOf(LocalAgentAdapter)
    expect(adapter.info).toMatchObject({ id: 'local', kind: 'local' })
  })

  it('lets the local adapter simulate structured tool events', async () => {
    const adapter = new LocalAgentAdapter({ chunkDelayMs: 0 })

    const events = await collectEvents(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: '@pivot-tool fs.readText {"filePath":"D:\\\\Project\\\\Tiny Agent Code\\\\README.md"}',
    }))

    expect(events).toEqual([
      { text: 'Pivot local runtime prepared 1 tool request(s).\n\n', type: 'text' },
      {
        input: { filePath: 'D:\\Project\\Tiny Agent Code\\README.md' },
        toolName: 'fs.readText',
        type: 'tool',
      },
    ])
  })

  it('rejects invalid local tool JSON', async () => {
    const adapter = new LocalAgentAdapter({ chunkDelayMs: 0 })

    await expect(collectEvents(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: '@pivot-tool fs.readText {"filePath":}',
    }))).rejects.toThrow('Local tool input must be valid JSON')
  })

  it('reports configured CLI adapter info from the environment', () => {
    const adapter = createAgentAdapterFromEnvironment({
      PIVOT_AGENT_ARGS_JSON: '["run","{{prompt}}"]',
      PIVOT_AGENT_COMMAND: 'pivot-agent',
    })

    expect(adapter.info).toEqual({
      args: ['run', '{{prompt}}'],
      command: 'pivot-agent',
      id: 'cli',
      kind: 'cli',
      label: 'Configured CLI Agent',
    })
  })

  it('streams CLI stdout and replaces prompt placeholders in args', async () => {
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const adapter = new CliAgentAdapter({
      args: ['run', '{{prompt}}'],
      command: 'pivot-agent',
      spawnProcess: spawnProcess as never,
    })

    const outputPromise = collectText(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'build the MVP',
    }))

    child.stdout.write('hello ')
    child.stderr.write('status ')
    child.stdout.write('pivot')
    child.emit('close', 0)

    const output = await outputPromise
    expect(output).toContain('hello pivot')
    expect(output).toContain('status ')
    expect(spawnProcess).toHaveBeenCalledWith(
      'pivot-agent',
      ['run', 'build the MVP'],
      expect.objectContaining({ shell: false, stdio: 'pipe' }),
    )
  })

  it('writes the prompt to stdin when args have no prompt placeholder', async () => {
    const child = new FakeChildProcess()
    const stdinChunks: string[] = []
    child.stdin.on('data', (chunk) => {
      stdinChunks.push(chunk.toString())
    })
    const adapter = new CliAgentAdapter({
      args: ['run'],
      command: 'pivot-agent',
      spawnProcess: vi.fn(() => child) as never,
    })

    const outputPromise = collectText(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'read the project',
    }))

    child.stdout.write('done')
    child.emit('close', 0)

    await expect(outputPromise).resolves.toBe('done')
    expect(stdinChunks).toEqual(['read the project'])
  })

  it('fails when the CLI exits non-zero', async () => {
    const child = new FakeChildProcess()
    const adapter = new CliAgentAdapter({
      command: 'pivot-agent',
      spawnProcess: vi.fn(() => child) as never,
    })

    const outputPromise = collectText(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'fail',
    }))

    child.emit('close', 42)

    await expect(outputPromise).rejects.toThrow('CLI Agent exited with code 42')
  })

  it('fails deterministically when the CLI closes without an exit code', async () => {
    const child = new FakeChildProcess()
    const adapter = new CliAgentAdapter({
      command: 'pivot-agent',
      spawnProcess: vi.fn(() => child) as never,
    })
    const outputPromise = collectText(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'terminated',
    }))

    child.emit('close', null)

    await expect(outputPromise).rejects.toThrow('CLI Agent terminated without an exit code')
  })

  it('treats stderr as text instead of executable structured events', async () => {
    const child = new FakeChildProcess()
    const adapter = new CliAgentAdapter({
      command: 'pivot-agent',
      spawnProcess: vi.fn(() => child) as never,
    })
    const eventsPromise = collectEvents(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'stderr',
    }))
    const diagnostic = '{"type":"permission","toolName":"fs.write","input":{}}\n'

    child.stderr.write(diagnostic)
    child.emit('close', 0)

    await expect(eventsPromise).resolves.toEqual([{ text: diagnostic, type: 'text' }])
  })

  it('does not flush a partial stdout control event when stderr interleaves', async () => {
    const child = new FakeChildProcess()
    const adapter = new CliAgentAdapter({
      command: 'pivot-agent',
      spawnProcess: vi.fn(() => child) as never,
    })
    const eventsPromise = collectEvents(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'interleaved',
    }))

    child.stdout.write('{"type":"phase",')
    child.stderr.write('diagnostic\n')
    child.stdout.write('"phase":"tool_use"}\n')
    child.emit('close', 0)

    await expect(eventsPromise).resolves.toEqual([
      { text: 'diagnostic\n', type: 'text' },
      { phase: 'tool_use', type: 'phase' },
    ])
  })

  it('parses CLI structured events from stdout', async () => {
    const child = new FakeChildProcess()
    const adapter = new CliAgentAdapter({
      command: 'pivot-agent',
      spawnProcess: vi.fn(() => child) as never,
    })

    const eventsPromise = collectEvents(adapter.stream({
      requestPermission: async () => 'allow',
      sessionId: 'session-1',
      signal: new AbortController().signal,
      text: 'structured',
    }))

    child.stdout.write('{"type":"operation","id":"op-1","status":"running","description":"Inspect"}\n')
    child.stdout.write('{"type":"phase","phase":"tool_use"}\n')
    child.stdout.write('{"type":"permission","toolName":"fs.write","input":{"path":"README.md"}}\n')
    child.stdout.write('plain text')
    child.emit('close', 0)

    await expect(eventsPromise).resolves.toEqual([
      { description: 'Inspect', id: 'op-1', status: 'running', type: 'operation' },
      { phase: 'tool_use', type: 'phase' },
      { input: { path: 'README.md' }, toolName: 'fs.write', type: 'permission' },
      { text: 'plain text', type: 'text' },
    ])
  })

  it('kills a CLI that exceeds stdout or unterminated-line limits', async () => {
    const child = new FakeChildProcess()
    const adapter = new CliAgentAdapter({
      command: 'pivot-agent',
      resourceLimits: { maxLineBytes: 16, maxStdoutBytes: 64 },
      spawnProcess: vi.fn(() => child) as never,
    })
    const output = collectEvents(adapter.stream(request('line-limit')))

    child.stdout.write('x'.repeat(17))

    await expect(output).rejects.toThrow(/line.*limit/i)
    expect(child.killed).toBe(true)

    const tailChild = new FakeChildProcess()
    const tailAdapter = new CliAgentAdapter({
      command: 'pivot-agent', resourceLimits: { maxLineBytes: 16, maxStdoutBytes: 64 },
      spawnProcess: vi.fn(() => tailChild) as never,
    })
    const tailOutput = collectEvents(tailAdapter.stream(request('tail-limit')))
    tailChild.stdout.write(`ok\n${'y'.repeat(17)}`)
    await expect(tailOutput).rejects.toThrow(/line.*limit/i)
    expect(tailChild.killed).toBe(true)
  })

  it('kills a CLI that exceeds stderr and queued-event limits', async () => {
    const stderrChild = new FakeChildProcess()
    const stderrAdapter = new CliAgentAdapter({
      command: 'pivot-agent', resourceLimits: { maxStderrBytes: 8 },
      spawnProcess: vi.fn(() => stderrChild) as never,
    })
    const stderrOutput = collectEvents(stderrAdapter.stream(request('stderr-limit')))
    stderrChild.stderr.write('123456789')
    await expect(stderrOutput).rejects.toThrow(/stderr.*limit/i)
    expect(stderrChild.killed).toBe(true)

    const queueChild = new FakeChildProcess()
    const queueAdapter = new CliAgentAdapter({
      command: 'pivot-agent', resourceLimits: { maxQueuedEvents: 2 },
      spawnProcess: vi.fn(() => queueChild) as never,
    })
    const queueOutput = collectEvents(queueAdapter.stream(request('queue-limit')))
    queueChild.stdout.write('one\ntwo\nthree\n')
    await expect(queueOutput).rejects.toThrow(/queue.*limit/i)
    expect(queueChild.killed).toBe(true)
  })

  it('rejects oversized or deeply nested structured CLI event fields', async () => {
    const textChild = new FakeChildProcess()
    const textAdapter = new CliAgentAdapter({
      command: 'pivot-agent', resourceLimits: { maxEventTextBytes: 4, maxLineBytes: 256 },
      spawnProcess: vi.fn(() => textChild) as never,
    })
    const textOutput = collectEvents(textAdapter.stream(request('event-limit')))
    textChild.stdout.write('{"type":"text","text":"12345"}\n')
    await expect(textOutput).rejects.toThrow(/event.*text.*limit/i)

    const inputChild = new FakeChildProcess()
    const inputAdapter = new CliAgentAdapter({
      command: 'pivot-agent', resourceLimits: { maxInputDepth: 2, maxLineBytes: 256 },
      spawnProcess: vi.fn(() => inputChild) as never,
    })
    const inputOutput = collectEvents(inputAdapter.stream(request('input-limit')))
    inputChild.stdout.write('{"type":"tool","toolName":"fs.readText","input":{"a":{"b":{"c":1}}}}\n')
    await expect(inputOutput).rejects.toThrow(/input.*depth/i)
    expect(inputChild.killed).toBe(true)
  })
})

function request(text: string) {
  return { requestPermission: async () => 'allow' as const, sessionId: 'session-1', signal: new AbortController().signal, text }
}
