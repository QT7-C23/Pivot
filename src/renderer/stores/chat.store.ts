import { create } from 'zustand'
import type { ChatMessage } from '../../shared/types/domain'
import type { SignalMap } from '../../shared/signal-channel'
import { chatService } from '../services/chat.service'

export type { ChatMessage } from '../../shared/types/domain'

export interface ChatStore {
  activeRunId: string | null
  activeSessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  streamPhase: 'thinking' | 'writing' | 'tool_use' | null
  error: string | null

  addMessage: (msg: ChatMessage) => void
  appendStreamText: (payload: SignalMap['stream:delta']) => void
  abortStream: () => void
  clearError: () => void
  loadMessages: (sessionId: string) => Promise<void>
  replaceMessages: (messages: ChatMessage[]) => void
  setError: (error: string | null) => void
  setStreamPhase: (payload: SignalMap['stream:phase']) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  activeRunId: null,
  activeSessionId: null,
  messages: [],
  isStreaming: false,
  streamPhase: null,
  error: null,

  addMessage: (msg) => {
    set((state) => ({ messages: [...state.messages, msg] }))
  },

  appendStreamText: ({ runId, sessionId, text }) => {
    set((state) => {
      if (state.activeSessionId !== sessionId || (state.activeRunId && state.activeRunId !== runId)) {
        return state
      }
      const last = state.messages.at(-1)
      if (!last || last.role !== 'assistant' || last.sessionId !== sessionId) {
        return {
          activeRunId: runId,
          isStreaming: true,
          messages: [
            ...state.messages,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              sessionId,
              text,
              timestamp: new Date().toISOString(),
            },
          ],
        }
      }

      return {
        activeRunId: runId,
        isStreaming: true,
        messages: [
          ...state.messages.slice(0, -1),
          {
            ...last,
            text: `${last.text}${text}`,
          },
        ],
      }
    })
  },

  setStreamPhase: ({ phase, runId, sessionId }) => {
    set((state) => {
      if (
        state.activeSessionId !== sessionId
        || (phase !== 'thinking' && state.activeRunId && state.activeRunId !== runId)
      ) {
        return state
      }
      return {
        activeRunId: phase === null ? null : runId,
        isStreaming: phase !== null,
        streamPhase: phase,
      }
    })
  },

  abortStream: () => {
    set({ activeRunId: null, isStreaming: false, streamPhase: null })
  },

  clearError: () => {
    set({ error: null })
  },

  async loadMessages(sessionId) {
    set({ activeRunId: null, activeSessionId: sessionId, isStreaming: false, streamPhase: null })
    try {
      const messages = await chatService.list(sessionId)
      if (get().activeSessionId === sessionId) {
        set({ error: null, messages })
      }
    } catch (error) {
      if (get().activeSessionId === sessionId) {
        set({ error: error instanceof Error ? error.message : 'Failed to load messages' })
      }
    }
  },

  replaceMessages(messages) {
    set({ messages })
  },

  setError: (error) => {
    set({ error })
  },
}))
