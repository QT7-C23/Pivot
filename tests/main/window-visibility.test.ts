import { describe, expect, it, vi } from 'vitest'
import { revealWindow } from '../../src/main/services/window-visibility'

function createWindowState(overrides: Partial<{
  destroyed: boolean
  minimized: boolean
}> = {}) {
  const focus = vi.fn()
  const restore = vi.fn()
  const show = vi.fn()
  return {
    focus,
    isDestroyed: () => overrides.destroyed ?? false,
    isMinimized: () => overrides.minimized ?? false,
    restore,
    show,
  }
}

describe('main window visibility', () => {
  it('shows and focuses a live window', () => {
    const window = createWindowState()

    revealWindow(window)

    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(window.restore).not.toHaveBeenCalled()
  })

  it('restores a minimized window before showing it', () => {
    const window = createWindowState({ minimized: true })

    revealWindow(window)

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.restore.mock.invocationCallOrder[0]).toBeLessThan(
      window.show.mock.invocationCallOrder[0]!,
    )
  })

  it('does nothing after the window is destroyed', () => {
    const window = createWindowState({ destroyed: true })

    revealWindow(window)

    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})
