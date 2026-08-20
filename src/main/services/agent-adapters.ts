import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import type { AgentAdapterInfo, PermissionBehavior } from '../../shared/types/domain'
import { parseArgs } from './utils/parse-args'
import { CliEventParser, type AgentAdapterEvent } from './agent-events'
import type { CliAgentResourceLimits } from './agent-resource-limits'
import { resolveCliAgentResourceLimits, utf8Bytes } from './agent-resource-limits'

export interface AgentAdapterRequest {
  requestPermission: (toolName: string, input: Record<string, unknown>) => Promise<PermissionBehavior>
  sessionId: string
  signal: AbortSignal
  text: string
}

export interface AgentAdapter {
  id: string
  info: AgentAdapterInfo
  label: string
  stream: (request: AgentAdapterRequest) => AsyncIterable<AgentAdapterEvent>
}

export class LocalAgentAdapter implements AgentAdapter {
  readonly id = 'local'
  readonly label = 'Pivot Local Runtime'
  private readonly chunkDelayMs: number
  private readonly profileId?: string

  constructor(options: { chunkDelayMs?: number; profileId?: string } = {}) {
    this.chunkDelayMs = options.chunkDelayMs ?? 18
    this.profileId = options.profileId
  }

  get info(): AgentAdapterInfo {
    return {
      id: this.id,
      kind: 'local',
      label: this.label,
      ...(this.profileId ? { profileId: this.profileId } : {}),
    }
  }

  async *stream({ requestPermission, signal, text }: AgentAdapterRequest): AsyncIterable<AgentAdapterEvent> {
    const localToolEvents = parseLocalToolEvents(text)
    if (localToolEvents.length > 0) {
      yield { text: `Pivot local runtime prepared ${localToolEvents.length} tool request(s).\n\n`, type: 'text' }
      for (const event of localToolEvents) {
        this.throwIfAborted(signal)
        yield event
      }
      return
    }

    if (text.includes('@tool')) {
      const behavior = await requestPermission('local.previewTool', { prompt: text })
      if (behavior === 'deny') {
        yield { text: 'Permission denied. Pivot did not run the requested preview tool.', type: 'text' }
        return
      }

      yield { text: 'Permission allowed. Pivot can continue with the preview tool.\n\n', type: 'text' }
    }

    for (const chunk of this.createDraftResponse(text)) {
      this.throwIfAborted(signal)
      yield { text: chunk, type: 'text' }
      await this.wait(signal)
    }
  }

  private createDraftResponse(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim()
    const response = [
      'Pivot local runtime received your request.',
      '',
      `Request: ${normalized}`,
      '',
      'The UI, IPC, stream signals, and Agent state pipeline are now connected.',
      'A real CLI Agent adapter can replace this runtime without changing the renderer contract.',
    ].join('\n')

    return response.match(/.{1,24}(\s|$)|\n/g)?.filter(Boolean) ?? [response]
  }

  private async wait(signal: AbortSignal): Promise<void> {
    this.throwIfAborted(signal)
    await delay(this.chunkDelayMs)
    this.throwIfAborted(signal)
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error('Agent run aborted')
    }
  }
}

type SpawnProcess = typeof spawn

export class CliAgentAdapter implements AgentAdapter {
  readonly id = 'cli'
  readonly label = 'Configured CLI Agent'
  private readonly args: string[]
  private readonly command: string
  private readonly cwd?: string
  private readonly env: NodeJS.ProcessEnv
  private readonly profileId?: string
  private readonly spawnProcess: SpawnProcess
  private readonly resourceLimits: Readonly<CliAgentResourceLimits>

  constructor(options: {
    args?: string[]
    command: string
    cwd?: string
    env?: NodeJS.ProcessEnv
    profileId?: string
    resourceLimits?: Partial<CliAgentResourceLimits>
    spawnProcess?: SpawnProcess
  }) {
    this.args = options.args ?? []
    this.command = options.command
    this.cwd = options.cwd
    this.env = options.env ?? process.env
    this.profileId = options.profileId
    this.spawnProcess = options.spawnProcess ?? spawn
    this.resourceLimits = resolveCliAgentResourceLimits(options.resourceLimits)
  }

  get info(): AgentAdapterInfo {
    return {
      args: this.args,
      command: this.command,
      id: this.id,
      kind: 'cli',
      label: this.label,
      ...(this.profileId ? { profileId: this.profileId } : {}),
    }
  }

  async *stream({ signal, text }: AgentAdapterRequest): AsyncIterable<AgentAdapterEvent> {
    const args = this.args.map((arg) => arg.replaceAll('{{prompt}}', text))
    const usesPromptPlaceholder = this.args.some((arg) => arg.includes('{{prompt}}'))
    const child = this.spawnProcess(this.command, args, {
      cwd: this.cwd,
      env: this.env,
      shell: false,
      stdio: 'pipe',
    })
    const parser = new CliEventParser(this.resourceLimits)
    const queue: AgentAdapterEvent[] = []
    let queuedBytes = 0
    let stdoutBytes = 0
    let stderrBytes = 0
    let closed = false
    let closeCode: number | null = null
    let processError: Error | null = null
    let resolvePending: (() => void) | null = null

    const wake = (): void => {
      resolvePending?.()
      resolvePending = null
    }
    const failResourceLimit = (error: unknown): void => {
      if (processError) return
      processError = error instanceof Error ? error : new Error(String(error))
      queue.length = 0
      queuedBytes = 0
      if (!closed) child.kill()
      wake()
    }
    const enqueue = (events: AgentAdapterEvent[]): void => {
      for (const event of events) {
        const bytes = utf8Bytes(JSON.stringify(event))
        if (queue.length + 1 > this.resourceLimits.maxQueuedEvents) throw new Error('CLI Agent event queue limit exceeded')
        if (queuedBytes + bytes > this.resourceLimits.maxQueuedBytes) throw new Error('CLI Agent event queue byte limit exceeded')
        queue.push(event); queuedBytes += bytes
      }
    }
    const dequeue = (): AgentAdapterEvent => {
      const event = queue.shift()!
      queuedBytes -= utf8Bytes(JSON.stringify(event))
      return event
    }
    const pushStdout = (chunk: Buffer | string): void => {
      try {
        stdoutBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : utf8Bytes(chunk)
        if (stdoutBytes > this.resourceLimits.maxStdoutBytes) throw new Error('CLI Agent stdout limit exceeded')
        enqueue(parser.push(chunk.toString()))
        wake()
      } catch (error) { failResourceLimit(error) }
    }
    const pushStderr = (chunk: Buffer | string): void => {
      try {
        const text = chunk.toString()
        stderrBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : utf8Bytes(chunk)
        if (stderrBytes > this.resourceLimits.maxStderrBytes) throw new Error('CLI Agent stderr limit exceeded')
        if (utf8Bytes(text) > this.resourceLimits.maxEventTextBytes) throw new Error('CLI Agent stderr event text limit exceeded')
        enqueue([{ text, type: 'text' }]); wake()
      } catch (error) { failResourceLimit(error) }
    }
    const abortChild = (): void => {
      child.kill()
      wake()
    }

    child.stdout?.on('data', pushStdout)
    child.stderr?.on('data', pushStderr)
    child.on('error', (error) => {
      processError ??= error
      wake()
    })
    child.on('close', (code) => {
      closed = true
      closeCode = code
      wake()
    })
    signal.addEventListener('abort', abortChild, { once: true })

    if (!usesPromptPlaceholder) {
      child.stdin?.end(text)
    }

    try {
      while (!closed && !processError && !signal.aborted) {
        while (queue.length > 0) {
          yield dequeue()
        }

        if (!closed && !processError && !signal.aborted) {
          await new Promise<void>((resolve) => {
            resolvePending = resolve
          })
        }
      }

      if (processError) throw processError
      while (queue.length > 0) yield dequeue()
      enqueue(parser.flush())
      while (queue.length > 0) {
        yield dequeue()
      }

      if (signal.aborted) {
        throw new Error('Agent run aborted')
      }
      if (processError) {
        throw processError
      }
      if (closeCode === null) {
        throw new Error('CLI Agent terminated without an exit code')
      }
      if (closeCode !== 0) {
        throw new Error(`CLI Agent exited with code ${closeCode}`)
      }
    } finally {
      queue.length = 0
      child.stdout?.off('data', pushStdout)
      child.stderr?.off('data', pushStderr)
      signal.removeEventListener('abort', abortChild)
      if (!closed && !signal.aborted) {
        child.kill()
      }
    }
  }
}

export function createAgentAdapterFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: { localChunkDelayMs?: number } = {},
): AgentAdapter {
  const command = env['PIVOT_AGENT_COMMAND']?.trim()
  if (!command) {
    return new LocalAgentAdapter({ chunkDelayMs: options.localChunkDelayMs })
  }

  return new CliAgentAdapter({
    args: parseArgs(env['PIVOT_AGENT_ARGS_JSON']),
    command,
    cwd: env['PIVOT_AGENT_CWD'],
    env,
  })
}

function parseLocalToolEvents(text: string): AgentAdapterEvent[] {
  const events: AgentAdapterEvent[] = []

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*@pivot-tool\s+([A-Za-z0-9_.-]+)\s+(\{.*\})\s*$/)
    if (!match) {
      continue
    }

    const input = parseLocalToolInput(match[2])
    events.push({
      input,
      toolName: match[1],
      type: 'tool',
    })
  }

  return events
}

function parseLocalToolInput(inputJson: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(inputJson)
  } catch {
    throw new Error('Local tool input must be valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Local tool input must be a JSON object')
  }

  return parsed as Record<string, unknown>
}
