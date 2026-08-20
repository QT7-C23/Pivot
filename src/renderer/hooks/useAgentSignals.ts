import { useEffect } from 'react'
import { useAgentStore } from '../stores/agent.store'
import { useChatStore } from '../stores/chat.store'

export function useAgentSignals(): void {
  const appendStreamText = useChatStore((state) => state.appendStreamText)
  const setStreamPhase = useChatStore((state) => state.setStreamPhase)
  const setAgentState = useAgentStore((state) => state.setState)
  const upsertOperation = useAgentStore((state) => state.upsertOperation)

  useEffect(() => {
    const unsubscribeDelta = window.pivot.onSignal('stream:delta', (payload) => {
      appendStreamText(payload)
    })
    const unsubscribePhase = window.pivot.onSignal('stream:phase', (payload) => {
      setStreamPhase(payload)
    })
    const unsubscribeState = window.pivot.onSignal('agent:state', (payload) => {
      if (acceptsActiveRun(payload, payload.state === 'thinking')) setAgentState(payload.state)
    })
    const unsubscribeOperation = window.pivot.onSignal('agent:operation', ({ runId, sessionId, ...operation }) => {
      if (acceptsActiveRun({ runId, sessionId })) upsertOperation(operation)
    })

    return () => {
      unsubscribeDelta()
      unsubscribePhase()
      unsubscribeState()
      unsubscribeOperation()
    }
  }, [appendStreamText, setAgentState, setStreamPhase, upsertOperation])
}

export function acceptsActiveRun(
  identity: { runId: string; sessionId: string },
  allowNewRun = false,
): boolean {
  const { activeRunId, activeSessionId } = useChatStore.getState()
  return activeSessionId === identity.sessionId
    && (allowNewRun || activeRunId === null || activeRunId === identity.runId)
}
