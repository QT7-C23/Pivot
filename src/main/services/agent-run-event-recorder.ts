import type { AgentRunEventWriterPort } from './agent-run-event-ports'

export class AgentRunEventRecorder {
  private finished = false

  constructor(private readonly options: {
    runId: string
    sessionId: string
    writer: AgentRunEventWriterPort | null
  }) {}

  start(input: { adapterId: string; profileId: string | null; toolPolicy: 'full' | 'read-only' }): void {
    this.append('run-started', input)
  }

  phase(phase: 'thinking' | 'writing' | 'tool_use'): void {
    this.append('phase-changed', { phase })
  }

  permission(toolName: string, behavior: 'allow' | 'deny'): void {
    this.append('permission-resolved', { behavior, toolName })
  }

  toolStarted(operationId: string, toolName: string): void {
    this.append('tool-started', { operationId, toolName })
  }

  toolFinished(input: {
    fileAction: 'add' | 'modify' | 'delete' | null
    operationId: string
    outputBytes: number
    status: 'done' | 'error'
    toolName: string
  }): void {
    this.append('tool-finished', input)
  }

  finish(input: {
    errorName: string | null
    responseBytes: number
    status: 'completed' | 'aborted' | 'failed'
  }): void {
    if (this.finished) return
    this.append('run-finished', input)
    this.finished = true
  }

  private append<T extends Parameters<AgentRunEventWriterPort['append']>[0]['type']>(
    type: T,
    data: Extract<Parameters<AgentRunEventWriterPort['append']>[0], { type: T }>['data'],
  ): void {
    this.options.writer?.append({
      data,
      runId: this.options.runId,
      sessionId: this.options.sessionId,
      type,
    } as Parameters<AgentRunEventWriterPort['append']>[0])
  }
}
