export interface CliAgentResourceLimits {
  maxEventTextBytes: number
  maxInputBytes: number
  maxInputDepth: number
  maxLineBytes: number
  maxQueuedBytes: number
  maxQueuedEvents: number
  maxStderrBytes: number
  maxStdoutBytes: number
}

export const DEFAULT_CLI_AGENT_RESOURCE_LIMITS: Readonly<CliAgentResourceLimits> = Object.freeze({
  maxEventTextBytes: 256 * 1024,
  maxInputBytes: 256 * 1024,
  maxInputDepth: 16,
  maxLineBytes: 256 * 1024,
  maxQueuedBytes: 2 * 1024 * 1024,
  maxQueuedEvents: 4_096,
  maxStderrBytes: 1024 * 1024,
  maxStdoutBytes: 8 * 1024 * 1024,
})

export const DEFAULT_AGENT_RESPONSE_BYTES = 16 * 1024 * 1024

export function resolveCliAgentResourceLimits(
  input: Partial<CliAgentResourceLimits> = {},
): Readonly<CliAgentResourceLimits> {
  const limits = { ...DEFAULT_CLI_AGENT_RESOURCE_LIMITS, ...input }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`)
  }
  return Object.freeze(limits)
}

export function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
