import { randomUUID } from 'node:crypto'
import { DEFAULT_AGENT_RESPONSE_BYTES, utf8Bytes } from './agent-resource-limits'
import type { SignalMap } from '../../shared/signal-channel'
import type {
  AgentAdapterInfo,
  AgentCliCustomProfileConfig,
  AgentCliMaintenanceAction,
  AgentCliMaintenanceResult,
  AgentCliProfile,
  AgentCliProfileId,
  AgentRequestContext,
  PermissionDecision,
} from '../../shared/types/domain'
import { createAgentAdapterFromEnvironment, type AgentAdapter } from './agent-adapters'
import { AgentCliProfileRegistry } from './agent-cli-profiles'
import type { AgentAdapterEvent } from './agent-events'
import { buildAgentPrompt } from './agent-prompt'
import type { AgentToolExecutor } from './agent-tool-executor'
import type { AgentRunEventWriterPort } from './agent-run-event-ports'
import { AgentRunEventRecorder } from './agent-run-event-recorder'
import { PermissionManager } from './permission-manager'
import type { MarketplaceAgentAugmentationPort } from './marketplace-resource-consumer-ports'
interface AgentRuntimeRequest {
  context?: AgentRequestContext
  sessionId: string
  text: string
  toolPolicy?: 'full' | 'read-only'
}
export type AgentSignalSender = <K extends keyof SignalMap>(signal: K, payload: SignalMap[K]) => void
interface AgentRun {
  abortController: AbortController
  sessionId: string
}
export class AgentRuntime {
  private readonly activeRuns = new Map<string, AgentRun>()
  private adapter: AgentAdapter
  private readonly profiles: AgentCliProfileRegistry | null
  private readonly permissions: PermissionManager
  private readonly tools: AgentToolExecutor | null
  private readonly events: AgentRunEventWriterPort | null
  private readonly maxResponseBytes: number
  private readonly marketplaceAugmentations: MarketplaceAgentAugmentationPort | null
  constructor(options: {
    adapter?: AgentAdapter
    chunkDelayMs?: number
    permissions?: PermissionManager
    profiles?: AgentCliProfileRegistry
    tools?: AgentToolExecutor
    events?: AgentRunEventWriterPort
    maxResponseBytes?: number
    marketplaceAugmentations?: MarketplaceAgentAugmentationPort
  } = {}) {
    this.profiles = options.profiles ?? (options.adapter ? null : new AgentCliProfileRegistry({
      localChunkDelayMs: options.chunkDelayMs,
    }))
    this.adapter = options.adapter ?? this.profiles?.createSelectedAdapter() ?? createAgentAdapterFromEnvironment(process.env, {
      localChunkDelayMs: options.chunkDelayMs,
    })
    this.permissions = options.permissions ?? new PermissionManager()
    this.tools = options.tools ?? null
    this.events = options.events ?? null
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_AGENT_RESPONSE_BYTES
    this.marketplaceAugmentations = options.marketplaceAugmentations ?? null
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes <= 0) throw new Error('maxResponseBytes must be a positive safe integer')
  }

  async send({ context, sessionId, text, toolPolicy = 'full' }: AgentRuntimeRequest, sendSignal: AgentSignalSender): Promise<string | null> {
    this.abort(sessionId)

    const abortController = new AbortController()
    this.activeRuns.set(sessionId, { abortController, sessionId })
    const runId = `run-${randomUUID()}`
    const streamIdentity = { runId, sessionId }
    const operationId = `operation-${sessionId}-${Date.now()}`
    const description = `Run ${this.adapter.label}`
    const promptText = buildAgentPrompt(text, context, this.marketplaceAugmentations?.read())
    const recorder = new AgentRunEventRecorder({ runId, sessionId, writer: this.events })
    let terminalRecorded = false
    let responseText = ''
    let responseBytes = 0

    try {
      recorder.start({ adapterId: this.adapter.id, profileId: this.adapter.info.profileId ?? null, toolPolicy })
      recorder.phase('thinking')
      sendSignal('agent:state', { ...streamIdentity, state: 'thinking' })
      sendSignal('agent:operation', {
        ...streamIdentity,
        description,
        id: operationId,
        status: 'running',
      })
      sendSignal('stream:phase', { ...streamIdentity, phase: 'thinking' })

      recorder.phase('writing')
      sendSignal('agent:state', { ...streamIdentity, state: 'writing' })
      sendSignal('stream:phase', { ...streamIdentity, phase: 'writing' })

      for await (const event of this.adapter.stream({
        requestPermission: async (toolName, input) => (
          this.requestPermission(toolName, input, sendSignal, abortController.signal, streamIdentity, recorder)
        ),
        sessionId,
        signal: abortController.signal,
        text: promptText,
      })) {
        this.throwIfAborted(abortController.signal)
        if (event.type === 'text' && responseBytes + utf8Bytes(event.text) > this.maxResponseBytes) {
          throw new Error('Agent response limit exceeded')
        }
        const result = await this.handleAdapterEvent(
          event, operationId, sessionId, sendSignal, abortController.signal, streamIdentity, toolPolicy, recorder,
        )
        if (result.text) {
          const resultBytes = utf8Bytes(result.text)
          if (responseBytes + resultBytes > this.maxResponseBytes) {
            throw new Error('Agent response limit exceeded')
          }
          sendSignal('stream:delta', { ...streamIdentity, text: result.text })
          responseText += result.text
          responseBytes += resultBytes
        }
        if (result.stop) {
          break
        }
      }

      recorder.finish({ errorName: null, responseBytes, status: 'completed' })
      terminalRecorded = true
      sendSignal('agent:operation', {
        ...streamIdentity,
        description,
        id: operationId,
        status: 'done',
      })
      sendSignal('stream:phase', { ...streamIdentity, phase: null })
      sendSignal('agent:state', { ...streamIdentity, state: 'idle' })
      return responseText
    } catch (error) {
      let terminalError: unknown = null
      if (!terminalRecorded) {
        try {
          recorder.finish({
            errorName: abortController.signal.aborted ? null : errorName(error),
            responseBytes,
            status: abortController.signal.aborted ? 'aborted' : 'failed',
          })
        } catch (recordError) {
          terminalError = recordError
        }
      }
      sendSignal('stream:phase', { ...streamIdentity, phase: null })
      if (abortController.signal.aborted && !terminalError) {
        sendSignal('agent:operation', {
          ...streamIdentity,
          description,
          id: operationId,
          status: 'error',
        })
        sendSignal('agent:state', { ...streamIdentity, state: 'idle' })
        return null
      }

      sendSignal('agent:operation', {
        ...streamIdentity,
        description,
        id: operationId,
        status: 'error',
      })
      sendSignal('agent:state', { ...streamIdentity, state: 'error' })
      throw terminalError ? new AggregateError([error, terminalError], 'Agent run and terminal evidence failed') : error
    } finally {
      if (this.activeRuns.get(sessionId)?.abortController === abortController) {
        this.activeRuns.delete(sessionId)
      }
    }
  }

  abort(sessionId: string): void {
    this.activeRuns.get(sessionId)?.abortController.abort()
    this.activeRuns.delete(sessionId)
  }

  listProfiles(): AgentCliProfile[] {
    return this.profiles?.listProfiles() ?? []
  }

  configureCustomProfile(config: AgentCliCustomProfileConfig): AgentCliProfile {
    if (!this.profiles) {
      throw new Error('Agent profile registry is not available')
    }

    const profile = this.profiles.configureCustomProfile(config)
    if (this.adapter.info.profileId === 'custom') {
      this.abortAll()
      this.adapter = this.profiles.createSelectedAdapter()
    }

    return profile
  }

  async runCliMaintenance(
    profileId: AgentCliProfileId,
    action: AgentCliMaintenanceAction,
  ): Promise<AgentCliMaintenanceResult> {
    if (!this.profiles) {
      throw new Error('Agent profile registry is not available')
    }

    return this.profiles.runMaintenance(profileId, action)
  }

  selectProfile(profileId: AgentCliProfileId): AgentAdapterInfo {
    if (!this.profiles) {
      throw new Error('Agent profile registry is not available')
    }

    this.abortAll()
    this.adapter = this.profiles.selectProfile(profileId)
    return this.adapter.info
  }

  useAdapter(adapter: AgentAdapter): AgentAdapterInfo {
    this.abortAll()
    this.adapter = adapter
    return this.adapter.info
  }

  resolvePermission(requestId: string, behavior: PermissionDecision): void {
    this.permissions.resolve(requestId, behavior)
  }

  clearPermissionSession(sessionId: string): void {
    this.permissions.clearSession(sessionId)
  }

  get activeRunCount(): number {
    return this.activeRuns.size
  }

  get adapterInfo(): AgentAdapterInfo {
    return this.adapter.info
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error('Agent run aborted')
    }
  }

  abortAll(): void {
    for (const run of this.activeRuns.values()) {
      run.abortController.abort()
    }
    this.activeRuns.clear()
  }

  private async handleAdapterEvent(
    event: AgentAdapterEvent,
    fallbackOperationId: string,
    sessionId: string,
    sendSignal: AgentSignalSender,
    signal: AbortSignal,
    streamIdentity: { runId: string; sessionId: string },
    toolPolicy: 'full' | 'read-only',
    recorder: AgentRunEventRecorder,
  ): Promise<{ stop: boolean; text: string }> {
    switch (event.type) {
      case 'text':
        return { stop: false, text: event.text }
      case 'phase':
        if (event.phase !== null) recorder.phase(event.phase)
        sendSignal('stream:phase', { ...streamIdentity, phase: event.phase })
        return { stop: false, text: '' }
      case 'operation':
        sendSignal('agent:operation', {
          ...streamIdentity,
          description: event.description,
          id: event.id ?? fallbackOperationId,
          status: event.status,
        })
        return { stop: false, text: '' }
      case 'permission': {
        const behavior = await this.requestPermission(event.toolName, event.input, sendSignal, signal, streamIdentity, recorder)
        if (behavior === 'allow') {
          return { stop: false, text: '' }
        }

        const text = `Permission denied for ${event.toolName}.`
        return { stop: true, text }
      }
      case 'tool':
        return this.handleToolEvent(event, fallbackOperationId, sessionId, sendSignal, signal, streamIdentity, toolPolicy, recorder)
    }
  }

  private async handleToolEvent(
    event: Extract<AgentAdapterEvent, { type: 'tool' }>,
    fallbackOperationId: string,
    sessionId: string,
    sendSignal: AgentSignalSender,
    signal: AbortSignal,
    streamIdentity: { runId: string; sessionId: string },
    toolPolicy: 'full' | 'read-only',
    recorder: AgentRunEventRecorder,
  ): Promise<{ stop: boolean; text: string }> {
    if (toolPolicy === 'read-only' && event.toolName !== 'fs.readText' && event.toolName !== 'fs.search') {
      const text = `Tool ${event.toolName} is blocked by the read-only planning contract.`
      return { stop: true, text }
    }
    if (!this.tools) {
      throw new Error('Agent tool executor is not available')
    }

    const operationId = event.id ?? fallbackOperationId
    sendSignal('agent:operation', {
      ...streamIdentity,
      description: `Run tool ${event.toolName}`,
      id: operationId,
      status: 'running',
    })
    const behavior = await this.requestPermission(event.toolName, event.input, sendSignal, signal, streamIdentity, recorder)
    if (behavior === 'deny') {
      const text = `Permission denied for ${event.toolName}.`
      sendSignal('agent:operation', {
        ...streamIdentity,
        description: `Run tool ${event.toolName}`,
        id: operationId,
        status: 'error',
      })
      return { stop: true, text }
    }

    recorder.toolStarted(operationId, event.toolName)
    recorder.phase('tool_use')
    sendSignal('agent:state', { ...streamIdentity, state: 'executing' })
    sendSignal('stream:phase', { ...streamIdentity, phase: 'tool_use' })
    let result
    try {
      result = await this.tools.execute({
        input: event.input,
        sessionId,
        toolName: event.toolName,
      })
    } catch (error) {
      recorder.toolFinished({
        fileAction: null, operationId, outputBytes: 0, status: 'error', toolName: event.toolName,
      })
      sendSignal('agent:operation', {
        ...streamIdentity,
        description: `Run tool ${event.toolName}`,
        id: operationId,
        status: 'error',
      })
      throw error
    }
    this.throwIfAborted(signal)
    recorder.toolFinished({
      fileAction: result.fileAction ?? null,
      operationId,
      outputBytes: utf8Bytes(result.text),
      status: 'done',
      toolName: event.toolName,
    })
    if (result.changedFilePath && result.fileAction) {
      sendSignal('file:changed', { ...streamIdentity, action: result.fileAction, path: result.changedFilePath })
    }
    sendSignal('agent:operation', {
      ...streamIdentity,
      description: `Run tool ${event.toolName}`,
      id: operationId,
      status: 'done',
    })
    recorder.phase('writing')
    sendSignal('agent:state', { ...streamIdentity, state: 'writing' })
    sendSignal('stream:phase', { ...streamIdentity, phase: 'writing' })
    return { stop: false, text: result.text }
  }

  private async requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    sendSignal: AgentSignalSender,
    signal: AbortSignal,
    streamIdentity: { runId: string; sessionId: string },
    recorder: AgentRunEventRecorder,
  ): Promise<'allow' | 'deny'> {
    sendSignal('agent:state', { ...streamIdentity, state: 'waiting_permission' })
    sendSignal('stream:phase', { ...streamIdentity, phase: 'tool_use' })
    const behavior = await this.permissions.request({ ...streamIdentity, input, toolName }, sendSignal, signal)
    recorder.permission(toolName, behavior)
    sendSignal('agent:state', { ...streamIdentity, state: 'writing' })
    sendSignal('stream:phase', { ...streamIdentity, phase: 'writing' })
    return behavior
  }
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim() ? error.name.slice(0, 160) : 'UnknownError'
}
