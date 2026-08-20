import { useCallback } from 'react'
import type { AgentClientContext } from '../../shared/types/domain'
import { useAgentStore } from '../stores/agent.store'
import { useChatStore } from '../stores/chat.store'

export function useSendMessage(): (
  text: string,
  sessionId: string,
  context?: AgentClientContext,
) => Promise<void> {
  const addMessage = useChatStore((state) => state.addMessage)
  const setError = useChatStore((state) => state.setError)
  const setAgentState = useAgentStore((state) => state.setState)
  const setCurrentTask = useAgentStore((state) => state.setCurrentTask)

  return useCallback(
    async (text: string, sessionId: string, context?: AgentClientContext) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }

      try {
        setError(null)
        addMessage({
          id: `user-${Date.now()}`,
          role: 'user',
          sessionId,
          text: trimmed,
          timestamp: new Date().toISOString(),
        })

        setAgentState('thinking')
        setCurrentTask(trimmed)

        await window.pivot.invoke('chat:send', { context, sessionId, text: trimmed })
      } catch (error) {
        setAgentState('error')
        setError(error instanceof Error ? error.message : 'Failed to send message')
      }
    },
    [addMessage, setAgentState, setCurrentTask, setError],
  )
}
