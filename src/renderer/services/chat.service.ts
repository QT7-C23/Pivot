import type { ChatMessage } from '../../shared/types/domain'

export const chatService = {
  list(sessionId: string): Promise<ChatMessage[]> {
    return window.pivot.invoke('chat:list', { sessionId })
  },
}
