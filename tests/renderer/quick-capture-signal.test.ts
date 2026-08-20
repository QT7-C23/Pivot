import { describe, expect, it, vi } from 'vitest'
import type { SignalMap } from '../../src/shared/signal-channel'
import { subscribeQuickCaptureSignal } from '../../src/renderer/hooks/useQuickCaptureSignal'

describe('quick capture renderer signal', () => {
  it.each(['shortcut', 'tray'] as const)('forwards the %s source through the typed app contract', (source) => {
    let handler: ((payload: SignalMap['app:quick-capture']) => void) | undefined
    const onCapture = vi.fn()
    const onSignal = vi.fn((
      signal: 'app:quick-capture',
      nextHandler: (payload: SignalMap['app:quick-capture']) => void,
    ) => {
      expect(signal).toBe('app:quick-capture')
      handler = nextHandler
      return vi.fn()
    })

    subscribeQuickCaptureSignal(onCapture, onSignal)
    handler?.({ source })

    expect(onCapture).toHaveBeenCalledWith(source)
  })

  it('returns the preload cleanup callback', () => {
    const unsubscribe = vi.fn()
    const cleanup = subscribeQuickCaptureSignal(vi.fn(), vi.fn(() => unsubscribe))

    cleanup()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
