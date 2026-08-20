import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../../src/renderer/stores/chat.store'

beforeEach(() => {
  useChatStore.setState({
    activeRunId: null,
    activeSessionId: 'session-1',
    error: null,
    isStreaming: false,
    messages: [],
    streamPhase: null,
  })
})

describe('chat stream identity', () => {
  it('ignores stream payloads for another session', () => {
    useChatStore.getState().appendStreamText({ runId: 'run-2', sessionId: 'session-2', text: 'wrong' })

    expect(useChatStore.getState().messages).toEqual([])
  })

  it('lets a new run supersede an old run and rejects late old-run frames', () => {
    const store = useChatStore.getState()
    store.setStreamPhase({ phase: 'thinking', runId: 'run-old', sessionId: 'session-1' })
    store.setStreamPhase({ phase: 'thinking', runId: 'run-new', sessionId: 'session-1' })
    store.appendStreamText({ runId: 'run-old', sessionId: 'session-1', text: 'late' })
    store.appendStreamText({ runId: 'run-new', sessionId: 'session-1', text: 'current' })
    store.setStreamPhase({ phase: null, runId: 'run-old', sessionId: 'session-1' })

    expect(useChatStore.getState()).toMatchObject({
      activeRunId: 'run-new',
      isStreaming: true,
      messages: [expect.objectContaining({ sessionId: 'session-1', text: 'current' })],
      streamPhase: 'thinking',
    })
  })
})
