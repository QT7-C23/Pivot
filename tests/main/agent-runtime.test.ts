import { describe, expect, it, vi } from 'vitest'
import type { AgentAdapter } from '../../src/main/services/agent-adapters'
import { LocalAgentAdapter } from '../../src/main/services/agent-adapters'
import { AgentRuntime } from '../../src/main/services/agent-runtime'
import { AgentCliProfileRegistry } from '../../src/main/services/agent-cli-profiles'
import type { AgentToolExecutor } from '../../src/main/services/agent-tool-executor'
import { PermissionManager } from '../../src/main/services/permission-manager'
import type { AgentRunEventWriterPort } from '../../src/main/services/agent-run-event-ports'
import type { AgentRunEventAppend } from '../../src/shared/agent-run-events'
import type { SignalMap } from '../../src/shared/signal-channel'

type SignalRecord = {
  payload: SignalMap[keyof SignalMap]
  signal: keyof SignalMap
}

describe('AgentRuntime', () => {
  it('records one ordered run ledger with a terminal outcome', async () => {
    const ledger = eventLedger()
    const runtime = new AgentRuntime({ chunkDelayMs: 0, events: ledger.writer })

    const response = await runtime.send({ sessionId: 'session-ledger', text: 'record this run' }, () => undefined)

    expect(ledger.events.map(({ type }) => type)).toEqual([
      'run-started', 'phase-changed', 'phase-changed', 'run-finished',
    ])
    expect(new Set(ledger.events.map(({ runId }) => runId).values()).size).toBe(1)
    expect(ledger.events.at(-1)).toMatchObject({
      data: { errorName: null, responseBytes: Buffer.byteLength(response ?? '', 'utf8'), status: 'completed' },
      sessionId: 'session-ledger', type: 'run-finished',
    })
  })

  it('records permission and tool facts before returning the tool result', async () => {
    const ledger = eventLedger()
    const permissions = new PermissionManager()
    const adapter: AgentAdapter = {
      id: 'fake', info: { id: 'fake', kind: 'local', label: 'Fake' }, label: 'Fake',
      async *stream() { yield { id: 'tool-read', input: { filePath: 'README.md' }, toolName: 'fs.readText', type: 'tool' } },
    }
    const runtime = new AgentRuntime({
      adapter, events: ledger.writer, permissions,
      tools: { execute: async () => ({ text: 'contents' }) },
    })
    const signals: SignalRecord[] = []
    const sending = runtime.send({ sessionId: 'session-ledger', text: 'read' }, (signal, payload) => signals.push({ payload, signal }))
    await waitFor(() => signals.some(({ signal }) => signal === 'permission:request'))
    const request = signals.find(({ signal }) => signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(request.requestId, 'allow')

    await expect(sending).resolves.toBe('contents')
    expect(ledger.events.map(({ type }) => type)).toEqual([
      'run-started', 'phase-changed', 'phase-changed', 'permission-resolved',
      'tool-started', 'phase-changed', 'tool-finished', 'phase-changed', 'run-finished',
    ])
    expect(ledger.events.find(({ type }) => type === 'tool-finished')).toMatchObject({
      data: { fileAction: null, operationId: 'tool-read', outputBytes: 8, status: 'done', toolName: 'fs.readText' },
    })
  })

  it('fails before tool execution when durable tool-start evidence cannot be recorded', async () => {
    const permissions = new PermissionManager()
    const execute = vi.fn(async () => ({ text: 'must not run' }))
    const ledger = eventLedger((event) => {
      if (event.type === 'tool-started') throw new Error('event store unavailable')
    })
    const adapter: AgentAdapter = {
      id: 'fake', info: { id: 'fake', kind: 'local', label: 'Fake' }, label: 'Fake',
      async *stream() { yield { input: {}, toolName: 'term.run', type: 'tool' } },
    }
    const runtime = new AgentRuntime({ adapter, events: ledger.writer, permissions, tools: { execute } })
    const signals: SignalRecord[] = []
    const sending = runtime.send({ sessionId: 'session-ledger', text: 'run' }, (signal, payload) => signals.push({ payload, signal }))
    await waitFor(() => signals.some(({ signal }) => signal === 'permission:request'))
    const request = signals.find(({ signal }) => signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(request.requestId, 'allow')

    await expect(sending).rejects.toThrow('event store unavailable')
    expect(execute).not.toHaveBeenCalled()
    expect(ledger.events.at(-1)).toMatchObject({ data: { status: 'failed' }, type: 'run-finished' })
  })

  it('records partial response bytes when a run fails after emitting text', async () => {
    const ledger = eventLedger()
    const adapter: AgentAdapter = {
      id: 'partial-failure', info: { id: 'partial-failure', kind: 'local', label: 'Partial failure' }, label: 'Partial failure',
      async *stream() {
        yield { text: '已输出', type: 'text' }
        throw new TypeError('adapter failed')
      },
    }
    const runtime = new AgentRuntime({ adapter, events: ledger.writer })

    await expect(runtime.send({ sessionId: 'session-partial', text: 'run' }, () => undefined)).rejects.toThrow('adapter failed')
    expect(ledger.events.at(-1)).toMatchObject({
      data: { errorName: 'TypeError', responseBytes: Buffer.byteLength('已输出', 'utf8'), status: 'failed' },
      type: 'run-finished',
    })
  })

  it('streams a local agent response through ordered signals', async () => {
    const runtime = new AgentRuntime({ chunkDelayMs: 0 })
    const signals: SignalRecord[] = []

    await runtime.send({ sessionId: 'session-1', text: 'Explain the current MVP' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    expect(signals.at(0)).toEqual({ payload: expect.objectContaining({ state: 'thinking' }), signal: 'agent:state' })
    expect(signals).toContainEqual({ payload: expect.objectContaining({ phase: 'thinking' }), signal: 'stream:phase' })
    expect(signals).toContainEqual({ payload: expect.objectContaining({ phase: 'writing' }), signal: 'stream:phase' })
    expect(signals.some((item) => item.signal === 'stream:delta')).toBe(true)
    expect(signals.at(-2)).toEqual({ payload: expect.objectContaining({ phase: null }), signal: 'stream:phase' })
    expect(signals.at(-1)).toEqual({ payload: expect.objectContaining({ state: 'idle' }), signal: 'agent:state' })
    const streamPayloads = signals
      .filter((item) => item.signal === 'stream:phase' || item.signal === 'stream:delta')
      .map((item) => item.payload as { runId: string; sessionId: string })
    expect(streamPayloads[0]).toMatchObject({ runId: expect.stringMatching(/^run-/), sessionId: 'session-1' })
    expect(new Set(streamPayloads.map((payload) => payload.runId)).size).toBe(1)
    expect(runtime.activeRunCount).toBe(0)
  })

  it('aborts an active run and clears its registry entry', async () => {
    const ledger = eventLedger()
    const runtime = new AgentRuntime({ chunkDelayMs: 5, events: ledger.writer })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: 'Long request' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    runtime.abort('session-1')
    await sendPromise

    expect(runtime.activeRunCount).toBe(0)
    expect(ledger.events.at(-1)).toMatchObject({ data: { status: 'aborted' }, type: 'run-finished' })
    expect(signals).toContainEqual({ payload: expect.objectContaining({ phase: null }), signal: 'stream:phase' })
    expect(signals.at(-1)).toEqual({ payload: expect.objectContaining({ state: 'idle' }), signal: 'agent:state' })
  })

  it('reports an error without an idle state when aborted-run evidence cannot be persisted', async () => {
    const ledger = eventLedger((event) => {
      if (event.type === 'run-finished') throw new Error('terminal evidence unavailable')
    })
    const runtime = new AgentRuntime({ chunkDelayMs: 5, events: ledger.writer })
    const states: string[] = []
    const sending = runtime.send({ sessionId: 'session-abort-evidence', text: 'Long request' }, (signal, payload) => {
      if (signal === 'agent:state') states.push((payload as SignalMap['agent:state']).state)
    })

    runtime.abort('session-abort-evidence')
    await expect(sending).rejects.toThrow('Agent run and terminal evidence failed')
    expect(states.at(-1)).toBe('error')
    expect(states).not.toContain('idle')
  })

  it('waits for permission before continuing a tool-gated local run', async () => {
    const permissions = new PermissionManager()
    const runtime = new AgentRuntime({ chunkDelayMs: 0, permissions })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: '@tool inspect workspace' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'allow')

    const response = await sendPromise

    expect(response).toContain('Permission allowed')
    expect(signals).toContainEqual({ payload: expect.objectContaining({ state: 'waiting_permission' }), signal: 'agent:state' })
    expect(signals).toContainEqual({ payload: expect.objectContaining({ phase: 'tool_use' }), signal: 'stream:phase' })
  })

  it('stops a tool-gated local run when permission is denied', async () => {
    const permissions = new PermissionManager()
    const runtime = new AgentRuntime({ chunkDelayMs: 0, permissions })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: '@tool inspect workspace' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'deny')

    const response = await sendPromise

    expect(response).toBe('Permission denied. Pivot did not run the requested preview tool.')
    expect(signals.filter((item) => item.signal === 'stream:delta')).toHaveLength(1)
  })

  it('maps structured adapter events to renderer signals', async () => {
    const permissions = new PermissionManager()
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream() {
        yield { phase: 'tool_use', type: 'phase' }
        yield { description: 'Read files', id: 'op-read', status: 'running', type: 'operation' }
        yield { input: { path: 'README.md' }, toolName: 'fs.read', type: 'permission' }
        yield { text: 'done', type: 'text' }
      },
    }
    const runtime = new AgentRuntime({ adapter, permissions })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: 'structured' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'allow')

    await expect(sendPromise).resolves.toBe('done')
    expect(signals).toContainEqual({ payload: expect.objectContaining({ phase: 'tool_use' }), signal: 'stream:phase' })
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ description: 'Read files', id: 'op-read', status: 'running' }),
      signal: 'agent:operation',
    })
    expect(signals).toContainEqual({ payload: expect.objectContaining({ text: 'done' }), signal: 'stream:delta' })
  })

  it('passes workspace context to adapters as part of the prompt', async () => {
    let adapterPrompt = ''
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream(request) {
        adapterPrompt = request.text
        yield { text: 'ok', type: 'text' }
      },
    }
    const runtime = new AgentRuntime({ adapter })

    await runtime.send({
      context: {
        activeFilePath: 'D:\\Project\\Tiny Agent Code\\src\\renderer\\App.tsx',
        projectPath: 'D:\\Project\\Tiny Agent Code',
      },
      sessionId: 'session-1',
      text: 'explain current file',
    }, () => undefined)

    expect(adapterPrompt).toContain('Project root: D:\\Project\\Tiny Agent Code')
    expect(adapterPrompt).toContain('Active file: D:\\Project\\Tiny Agent Code\\src\\renderer\\App.tsx')
    expect(adapterPrompt).toContain('User request:\nexplain current file')
  })

  it('executes adapter tool events only after permission is allowed', async () => {
    const permissions = new PermissionManager()
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream() {
        yield {
          id: 'tool-write',
          input: { content: 'after', filePath: 'D:\\Project\\Tiny Agent Code\\README.md' },
          toolName: 'fs.safeWrite',
          type: 'tool',
        }
      },
    }
    const executedInputs: Record<string, unknown>[] = []
    const tools: AgentToolExecutor = {
      async execute(request) {
        executedInputs.push(request.input)
        return {
          changedFilePath: String(request.input['filePath']),
          fileAction: 'modify',
          text: 'safe write complete',
        }
      },
    }
    const runtime = new AgentRuntime({ adapter, permissions, tools })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: 'write file' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    expect(executedInputs).toEqual([])
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'allow')

    await expect(sendPromise).resolves.toBe('safe write complete')
    expect(executedInputs).toEqual([{ content: 'after', filePath: 'D:\\Project\\Tiny Agent Code\\README.md' }])
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ action: 'modify', path: 'D:\\Project\\Tiny Agent Code\\README.md' }),
      signal: 'file:changed',
    })
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ description: 'Run tool fs.safeWrite', id: 'tool-write', status: 'done' }),
      signal: 'agent:operation',
    })
  })

  it('returns read-only tool output without file change signals', async () => {
    const permissions = new PermissionManager()
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream() {
        yield {
          input: { filePath: 'D:\\Project\\Tiny Agent Code\\README.md' },
          toolName: 'fs.readText',
          type: 'tool',
        }
      },
    }
    const tools: AgentToolExecutor = {
      async execute() {
        return { text: 'read text complete' }
      },
    }
    const runtime = new AgentRuntime({ adapter, permissions, tools })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: 'read file' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'allow')

    await expect(sendPromise).resolves.toBe('read text complete')
    expect(signals).toContainEqual({ payload: expect.objectContaining({ text: 'read text complete' }), signal: 'stream:delta' })
    expect(signals.some((item) => item.signal === 'file:changed')).toBe(false)
  })

  it('enforces the planning read-only tool policy before permission or execution', async () => {
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream() {
        yield { input: { content: 'unsafe', filePath: 'D:\\project\\file.ts' }, toolName: 'fs.safeWrite', type: 'tool' }
      },
    }
    const execute = vi.fn()
    const runtime = new AgentRuntime({ adapter, tools: { execute } })
    const signals: SignalRecord[] = []

    const response = await runtime.send({ sessionId: 'session-1', text: 'plan only', toolPolicy: 'read-only' }, (signal, payload) => signals.push({ payload, signal }))

    expect(response).toContain('blocked by the read-only planning contract')
    expect(execute).not.toHaveBeenCalled()
    expect(signals.some((item) => item.signal === 'permission:request')).toBe(false)
  })

  it('marks the exact tool operation as failed when its executor rejects', async () => {
    const permissions = new PermissionManager()
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream() {
        yield { id: 'tool-fail', input: {}, toolName: 'term.run', type: 'tool' }
      },
    }
    const runtime = new AgentRuntime({
      adapter,
      permissions,
      tools: { execute: async () => { throw new Error('tool exploded') } },
    })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: 'fail tool' }, (signal, payload) => {
      signals.push({ payload, signal })
    })
    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'allow')

    await expect(sendPromise).rejects.toThrow('tool exploded')
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ description: 'Run tool term.run', id: 'tool-fail', status: 'error' }),
      signal: 'agent:operation',
    })
  })

  it('routes local runtime tool simulation through the runtime permission gate', async () => {
    const permissions = new PermissionManager()
    const tools: AgentToolExecutor = {
      async execute(request) {
        return { text: `local tool executed ${request.toolName}` }
      },
    }
    const runtime = new AgentRuntime({
      adapter: new LocalAgentAdapter({ chunkDelayMs: 0 }),
      permissions,
      tools,
    })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({
      sessionId: 'session-1',
      text: '@pivot-tool fs.readText {"filePath":"D:\\\\Project\\\\Tiny Agent Code\\\\README.md"}',
    }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'allow')

    await expect(sendPromise).resolves.toContain('local tool executed fs.readText')
    expect(signals).toContainEqual({
      payload: expect.objectContaining({ text: 'local tool executed fs.readText' }),
      signal: 'stream:delta',
    })
  })

  it('refreshes the active custom adapter when custom CLI config changes', () => {
    const profiles = new AgentCliProfileRegistry({
      env: {
        PIVOT_AGENT_ARGS_JSON: '["old","{{prompt}}"]',
        PIVOT_AGENT_COMMAND: 'old-agent',
      },
    })
    const runtime = new AgentRuntime({ profiles })

    expect(runtime.adapterInfo).toMatchObject({
      args: ['old', '{{prompt}}'],
      command: 'old-agent',
      profileId: 'custom',
    })

    runtime.configureCustomProfile({
      adapterArgs: ['new', '{{prompt}}'],
      adapterCommand: 'new-agent',
      versionCommand: { args: ['--version'], command: 'new-agent' },
    })

    expect(runtime.adapterInfo).toMatchObject({
      args: ['new', '{{prompt}}'],
      command: 'new-agent',
      profileId: 'custom',
    })
  })

  it('keeps the active non-custom adapter when custom CLI config changes', () => {
    const profiles = new AgentCliProfileRegistry({ env: {} })
    const runtime = new AgentRuntime({ profiles })

    expect(runtime.adapterInfo).toMatchObject({ kind: 'local', profileId: 'local' })

    runtime.configureCustomProfile({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'custom-agent',
    })

    expect(runtime.adapterInfo).toMatchObject({ kind: 'local', profileId: 'local' })
  })

  it('does not execute adapter tool events when permission is denied', async () => {
    const permissions = new PermissionManager()
    const adapter: AgentAdapter = {
      id: 'fake',
      info: { id: 'fake', kind: 'local', label: 'Fake Adapter' },
      label: 'Fake Adapter',
      async *stream() {
        yield {
          input: { content: 'after', filePath: 'D:\\Project\\Tiny Agent Code\\README.md' },
          toolName: 'fs.safeWrite',
          type: 'tool',
        }
      },
    }
    let executed = false
    const tools: AgentToolExecutor = {
      async execute() {
        executed = true
        return { text: 'should not happen' }
      },
    }
    const runtime = new AgentRuntime({ adapter, permissions, tools })
    const signals: SignalRecord[] = []
    const sendPromise = runtime.send({ sessionId: 'session-1', text: 'write file' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const permission = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(permission.requestId, 'deny')

    await expect(sendPromise).resolves.toBe('Permission denied for fs.safeWrite.')
    expect(executed).toBe(false)
    expect(signals.some((item) => item.signal === 'file:changed')).toBe(false)
  })

  it('fails closed before aggregate Agent response memory can grow past its budget', async () => {
    const adapter: AgentAdapter = {
      id: 'unbounded', info: { id: 'unbounded', kind: 'local', label: 'Unbounded' }, label: 'Unbounded',
      async *stream() { yield { text: '1234', type: 'text' }; yield { text: '5678', type: 'text' } },
    }
    const runtime = new AgentRuntime({ adapter, maxResponseBytes: 6 })
    const signals: SignalRecord[] = []

    await expect(runtime.send({ sessionId: 'session-limit', text: 'overflow' }, (signal, payload) => {
      signals.push({ payload, signal })
    })).rejects.toThrow(/response.*limit/i)
    expect(runtime.activeRunCount).toBe(0)
    expect(signals.at(-1)).toEqual({ payload: expect.objectContaining({ state: 'error' }), signal: 'agent:state' })
  })

  it('does not emit an oversized tool result before enforcing the aggregate response budget', async () => {
    const permissions = new PermissionManager()
    const oversized = 'tool-result-that-exceeds-budget'
    const adapter: AgentAdapter = {
      id: 'tool-overflow', info: { id: 'tool-overflow', kind: 'local', label: 'Tool overflow' }, label: 'Tool overflow',
      async *stream() { yield { input: { filePath: 'large.txt' }, toolName: 'fs.readText', type: 'tool' } },
    }
    const tools: AgentToolExecutor = {
      async execute() { return { text: oversized } },
    }
    const runtime = new AgentRuntime({ adapter, maxResponseBytes: 8, permissions, tools })
    const signals: SignalRecord[] = []
    const sending = runtime.send({ sessionId: 'session-limit', text: 'read' }, (signal, payload) => {
      signals.push({ payload, signal })
    })
    await waitFor(() => signals.some((item) => item.signal === 'permission:request'))
    const request = signals.find((item) => item.signal === 'permission:request')?.payload as { requestId: string }
    permissions.resolve(request.requestId, 'allow')

    await expect(sending).rejects.toThrow(/response.*limit/i)
    expect(signals.filter((item) => item.signal === 'stream:delta'))
      .not.toContainEqual({ payload: expect.objectContaining({ text: oversized }), signal: 'stream:delta' })
  })
})

function eventLedger(beforeAppend?: (event: AgentRunEventAppend) => void): {
  events: AgentRunEventAppend[]
  writer: AgentRunEventWriterPort
} {
  const events: AgentRunEventAppend[] = []
  return {
    events,
    writer: {
      append(event) {
        beforeAppend?.(event)
        events.push(event)
        return {
          ...event,
          eventId: `event-${events.length}`,
          occurredAt: '2026-08-14T00:00:00.000Z',
          schemaVersion: 1,
          sequence: events.length,
        }
      },
    },
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error('Timed out waiting for condition')
}
