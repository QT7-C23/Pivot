import { describe, expect, it, vi } from 'vitest'
import type { SignalMap } from '../../src/shared/signal-channel'
import { subscribeFileSignals, subscribeSystemFileSignals } from '../../src/renderer/hooks/useFileSignals'

type FileSignalHandler = (payload: SignalMap['file:changed']) => void

describe('subscribeFileSignals', () => {
  it.each([
    ['add', 'added'],
    ['modify', 'modified'],
    ['delete', 'deleted'],
  ] as const)('maps %s signals to %s file changes', (action, changeType) => {
    let handler: FileSignalHandler | undefined
    const markChanged = vi.fn()
    const onSignal = vi.fn((signal: 'file:changed', nextHandler: FileSignalHandler) => {
      expect(signal).toBe('file:changed')
      handler = nextHandler
      return vi.fn()
    })

    subscribeFileSignals(markChanged, onSignal)
    expect(handler).toBeTypeOf('function')

    handler?.({ action, path: 'D:\\Project\\Tiny Agent Code\\src\\new.ts', runId: 'run-1', sessionId: 'session-1' })

    expect(markChanged).toHaveBeenCalledWith(
      'D:\\Project\\Tiny Agent Code\\src\\new.ts',
      changeType,
    )
  })

  it('returns the preload unsubscribe callback for effect cleanup', () => {
    const unsubscribe = vi.fn()
    const onSignal = vi.fn(() => unsubscribe)

    const cleanup = subscribeFileSignals(vi.fn(), onSignal)
    cleanup()

    expect(onSignal).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores file changes from another session', () => {
    let handler: FileSignalHandler | undefined
    const markChanged = vi.fn()
    subscribeFileSignals(markChanged, (_signal, nextHandler) => {
      handler = nextHandler
      return vi.fn()
    }, 'session-1')

    handler?.({ action: 'modify', path: 'D:\\other\\file.ts', runId: 'run-2', sessionId: 'session-2' })

    expect(markChanged).not.toHaveBeenCalled()
  })
})

describe('subscribeSystemFileSignals', () => {
  it('maps project watcher events without requiring an Agent run identity', () => {
    let handler: ((payload: SignalMap['file:system-changed']) => void) | undefined
    const markChanged = vi.fn()
    subscribeSystemFileSignals(markChanged, (_signal, nextHandler) => {
      handler = nextHandler
      return vi.fn()
    }, 'session-1')

    handler?.({ action: 'modify', path: 'C:\\project\\src\\app.ts', sessionId: 'session-1' })

    expect(markChanged).toHaveBeenCalledWith('C:\\project\\src\\app.ts', 'modified')
  })
})
