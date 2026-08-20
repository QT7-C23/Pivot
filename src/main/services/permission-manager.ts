import { createHash, randomUUID } from 'node:crypto'
import type { SignalMap } from '../../shared/signal-channel'
import type { PermissionBehavior, PermissionDecision, PermissionRequest } from '../../shared/types/domain'

export type PermissionSignalSender = <K extends keyof SignalMap>(signal: K, payload: SignalMap[K]) => void

interface PendingPermission {
  reject: (error: Error) => void
  resolve: (decision: PermissionDecision, reason?: SignalMap['permission:resolved']['reason']) => void
}

export interface PermissionOutcome {
  behavior: PermissionBehavior
  reason: SignalMap['permission:resolved']['reason']
}

const DEFAULT_PERMISSION_TIMEOUT_MS = 120_000

export class PermissionManager {
  private readonly pending = new Map<string, PendingPermission>()
  private readonly sessionRules = new Set<string>()
  private readonly timeoutMs: number

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PERMISSION_TIMEOUT_MS
  }

  request(
    input: Omit<PermissionRequest, 'requestId'>,
    sendSignal: PermissionSignalSender,
    signal?: AbortSignal,
  ): Promise<PermissionBehavior> {
    return this.requestDetailed(input, sendSignal, signal).then((outcome) => outcome.behavior)
  }

  requestDetailed(
    input: Omit<PermissionRequest, 'requestId'>,
    sendSignal: PermissionSignalSender,
    signal?: AbortSignal,
  ): Promise<PermissionOutcome> {
    if (this.sessionRules.has(permissionRuleKey(input.sessionId, input.toolName, input.input))) {
      return Promise.resolve({ behavior: 'allow', reason: 'response' })
    }
    const requestId = `permission-${randomUUID()}`
    const request: PermissionRequest = { ...input, requestId }

    return new Promise<PermissionOutcome>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const cleanup = (): void => {
        this.pending.delete(requestId)
        if (timeoutId) clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abort)
      }
      const settle = (
        behavior: PermissionBehavior,
        reason: SignalMap['permission:resolved']['reason'],
      ): void => {
        cleanup()
        notifyResolution(sendSignal, { behavior, reason, requestId })
        resolve({ behavior, reason })
      }
      const abort = (): void => settle('deny', 'abort')

      if (signal?.aborted) {
        resolve({ behavior: 'deny', reason: 'abort' })
        return
      }

      this.pending.set(requestId, {
        reject: (error) => {
          cleanup()
          notifyResolution(sendSignal, { behavior: 'deny', reason: 'error', requestId })
          reject(error)
        },
        resolve: (decision, reason = 'response') => {
          if (decision === 'allow_session') {
            this.sessionRules.add(permissionRuleKey(request.sessionId, request.toolName, request.input))
          }
          settle(decision === 'deny' ? 'deny' : 'allow', reason)
        },
      })
      signal?.addEventListener('abort', abort, { once: true })
      timeoutId = setTimeout(() => {
        this.pending.get(requestId)?.resolve('deny', 'timeout')
      }, this.timeoutMs)
      try {
        sendSignal('permission:request', request)
      } catch (error) {
        this.pending.get(requestId)?.reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  resolve(requestId: string, behavior: PermissionDecision): void {
    const pending = this.pending.get(requestId)
    if (!pending) {
      throw new Error(`Unknown permission request: ${requestId}`)
    }

    pending.resolve(behavior)
  }

  clearSession(sessionId: string): void {
    const prefix = `${sessionId}\u0000`
    for (const rule of this.sessionRules) {
      if (rule.startsWith(prefix)) this.sessionRules.delete(rule)
    }
  }

  rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }

  get pendingCount(): number {
    return this.pending.size
  }
}

function permissionRuleKey(sessionId: string, toolName: string, input: Record<string, unknown>): string {
  const inputDigest = createHash('sha256').update(stableSerialize(input), 'utf8').digest('hex')
  return `${sessionId}\u0000${toolName}\u0000${inputDigest}`
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(String(value))
}

function notifyResolution(
  sendSignal: PermissionSignalSender,
  payload: SignalMap['permission:resolved'],
): void {
  try {
    sendSignal('permission:resolved', payload)
  } catch {
    // The permission outcome must settle even if its renderer has already closed.
  }
}
