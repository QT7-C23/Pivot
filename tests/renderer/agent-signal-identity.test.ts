import { beforeEach, describe, expect, it } from 'vitest'
import { acceptsActiveRun } from '../../src/renderer/hooks/useAgentSignals'
import { useChatStore } from '../../src/renderer/stores/chat.store'

beforeEach(() => {
  useChatStore.setState({ activeRunId: 'run-current', activeSessionId: 'session-current' })
})

describe('agent signal identity', () => {
  it('rejects stale runs and other sessions', () => {
    expect(acceptsActiveRun({ runId: 'run-old', sessionId: 'session-current' })).toBe(false)
    expect(acceptsActiveRun({ runId: 'run-current', sessionId: 'session-other' })).toBe(false)
    expect(acceptsActiveRun({ runId: 'run-current', sessionId: 'session-current' })).toBe(true)
  })

  it('allows a thinking frame to establish a new run in the active session', () => {
    expect(acceptsActiveRun({ runId: 'run-next', sessionId: 'session-current' }, true)).toBe(true)
  })
})
