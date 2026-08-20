import type { AgentRunEvent, AgentRunEventAppend } from '../../shared/agent-run-events'

export interface AgentRunEventWriterPort {
  append(event: AgentRunEventAppend): AgentRunEvent
}

export interface AgentRunEventReaderPort {
  listRun(runId: string): readonly AgentRunEvent[]
  listSession(sessionId: string): readonly AgentRunEvent[]
}

export interface AgentRunEventLifecyclePort {
  deleteForSession(sessionId: string): void
}
