import type { SignalMap } from '../../shared/signal-channel'
import type { CliAgentResourceLimits } from './agent-resource-limits'
import { DEFAULT_CLI_AGENT_RESOURCE_LIMITS, utf8Bytes } from './agent-resource-limits'

export type AgentAdapterEvent =
  | { type: 'text'; text: string }
  | { type: 'phase'; phase: SignalMap['stream:phase']['phase'] }
  | { type: 'operation'; description: string; id?: string; status: SignalMap['agent:operation']['status'] }
  | { type: 'permission'; input: Record<string, unknown>; toolName: string }
  | { type: 'tool'; id?: string; input: Record<string, unknown>; toolName: string }

export class CliEventParser {
  private buffered = ''
  private readonly limits: Pick<CliAgentResourceLimits, 'maxEventTextBytes' | 'maxInputBytes' | 'maxInputDepth' | 'maxLineBytes'>

  constructor(limits: Partial<CliAgentResourceLimits> = {}) {
    this.limits = { ...DEFAULT_CLI_AGENT_RESOURCE_LIMITS, ...limits }
  }

  push(chunk: string): AgentAdapterEvent[] {
    this.buffered += chunk
    if (utf8Bytes(this.buffered) > this.limits.maxLineBytes && !/\r?\n/.test(this.buffered)) {
      throw new Error('CLI Agent unterminated line limit exceeded')
    }
    const events: AgentAdapterEvent[] = []
    const lines = this.buffered.split(/\r?\n/)
    this.buffered = lines.pop() ?? ''
    if (utf8Bytes(this.buffered) > this.limits.maxLineBytes) {
      throw new Error('CLI Agent unterminated line limit exceeded')
    }

    for (const line of lines) {
      events.push(...this.parseLine(line, true))
    }

    return events
  }

  flush(): AgentAdapterEvent[] {
    if (!this.buffered) {
      return []
    }

    const line = this.buffered
    this.buffered = ''
    return this.parseLine(line, false)
  }

  private parseLine(line: string, appendNewline: boolean): AgentAdapterEvent[] {
    if (utf8Bytes(line) > this.limits.maxLineBytes) throw new Error('CLI Agent line limit exceeded')
    if (!line.trim()) {
      return appendNewline ? [{ text: '\n', type: 'text' }] : []
    }

    const event = this.tryParseEvent(line)
    if (event) {
      return [event]
    }

    return [{ text: appendNewline ? `${line}\n` : line, type: 'text' }]
  }

  private tryParseEvent(line: string): AgentAdapterEvent | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      return null
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return null
    }

    if (!isRecord(parsed) || typeof parsed['type'] !== 'string') {
      return null
    }

    switch (parsed['type']) {
      case 'text':
        if (typeof parsed['text'] !== 'string') return null
        assertBytes(parsed['text'], this.limits.maxEventTextBytes, 'CLI Agent event text limit exceeded')
        return { text: parsed['text'], type: 'text' }
      case 'phase':
        return isPhase(parsed['phase']) ? { phase: parsed['phase'], type: 'phase' } : null
      case 'operation':
        return isOperationStatus(parsed['status']) && typeof parsed['description'] === 'string'
          ? {
              description: boundedField(parsed['description'], this.limits.maxEventTextBytes),
              id: typeof parsed['id'] === 'string' ? boundedField(parsed['id'], 1024) : undefined,
              status: parsed['status'],
              type: 'operation',
            }
          : null
      case 'permission':
        return typeof parsed['toolName'] === 'string'
          ? {
              input: boundedInput(parsed['input'], this.limits),
              toolName: boundedField(parsed['toolName'], 1024),
              type: 'permission',
            }
          : null
      case 'tool':
        return typeof parsed['toolName'] === 'string'
          ? {
              id: typeof parsed['id'] === 'string' ? boundedField(parsed['id'], 1024) : undefined,
              input: boundedInput(parsed['input'], this.limits),
              toolName: boundedField(parsed['toolName'], 1024),
              type: 'tool',
            }
          : null
      default:
        return null
    }
  }
}

function boundedField(value: string, maxBytes: number): string {
  assertBytes(value, maxBytes, 'CLI Agent event field limit exceeded')
  return value
}

function boundedInput(value: unknown, limits: Pick<CliAgentResourceLimits, 'maxInputBytes' | 'maxInputDepth'>): Record<string, unknown> {
  const input = isRecord(value) ? value : {}
  assertBytes(JSON.stringify(input), limits.maxInputBytes, 'CLI Agent input byte limit exceeded')
  if (depth(input) > limits.maxInputDepth) throw new Error('CLI Agent input depth limit exceeded')
  return input
}

function depth(value: unknown): number {
  const pending: Array<{ depth: number; value: unknown }> = [{ depth: 0, value }]
  let maximum = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    maximum = Math.max(maximum, current.depth)
    if (current.value === null || typeof current.value !== 'object') continue
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value as Record<string, unknown>)
    for (const child of children) pending.push({ depth: current.depth + 1, value: child })
  }
  return maximum
}

function assertBytes(value: string, maxBytes: number, message: string): void {
  if (utf8Bytes(value) > maxBytes) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOperationStatus(value: unknown): value is SignalMap['agent:operation']['status'] {
  return value === 'pending' || value === 'running' || value === 'done' || value === 'error'
}

function isPhase(value: unknown): value is SignalMap['stream:phase']['phase'] {
  return value === 'thinking' || value === 'writing' || value === 'tool_use' || value === null
}
