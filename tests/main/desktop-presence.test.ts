import { describe, expect, it, vi } from 'vitest'
import {
  DesktopPresenceController,
  QUICK_CAPTURE_ACCELERATORS,
  shouldHideWindowOnClose,
  type DesktopPresenceWindow,
  type GlobalShortcutPort,
} from '../../src/main/services/desktop-presence'

function createWindow(overrides: Partial<DesktopPresenceWindow> = {}): DesktopPresenceWindow {
  return {
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    ...overrides,
  }
}

function createShortcuts(accepted: string[]): GlobalShortcutPort & {
  callbacks: Map<string, () => void>
} {
  const callbacks = new Map<string, () => void>()
  return {
    callbacks,
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (!accepted.includes(accelerator)) return false
      callbacks.set(accelerator, callback)
      return true
    }),
    unregister: vi.fn((accelerator: string) => callbacks.delete(accelerator)),
  }
}

describe('desktop presence controller', () => {
  it('hides a visible window and reveals a hidden window from the tray', () => {
    const visibleWindow = createWindow()
    const hiddenWindow = createWindow({
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => false),
    })
    let currentWindow = visibleWindow
    const controller = new DesktopPresenceController({
      getWindow: () => currentWindow,
      onQuickCapture: vi.fn(),
      shortcuts: createShortcuts([]),
    })

    expect(controller.toggleWindow()).toBe('hidden')
    expect(visibleWindow.hide).toHaveBeenCalledOnce()

    currentWindow = hiddenWindow
    expect(controller.toggleWindow()).toBe('revealed')
    expect(hiddenWindow.restore).toHaveBeenCalledOnce()
    expect(hiddenWindow.show).toHaveBeenCalledOnce()
    expect(hiddenWindow.focus).toHaveBeenCalledOnce()
  })

  it('reveals the window before sending a typed quick-capture signal', () => {
    const window = createWindow({ isVisible: vi.fn(() => false) })
    const onQuickCapture = vi.fn()
    const controller = new DesktopPresenceController({
      getWindow: () => window,
      onQuickCapture,
      shortcuts: createShortcuts([]),
    })

    expect(controller.quickCapture('tray')).toBe(true)
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(onQuickCapture).toHaveBeenCalledWith(window, 'tray')
  })

  it('summons the window without changing renderer state', () => {
    const window = createWindow({ isVisible: vi.fn(() => false) })
    const onQuickCapture = vi.fn()
    const controller = new DesktopPresenceController({
      getWindow: () => window,
      onQuickCapture,
      shortcuts: createShortcuts([]),
    })

    expect(controller.showWindow()).toBe(true)
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(onQuickCapture).not.toHaveBeenCalled()
  })

  it('registers Alt+Space first, falls back safely, and unregisters on dispose', () => {
    const shortcuts = createShortcuts([QUICK_CAPTURE_ACCELERATORS[1]])
    const window = createWindow()
    const onQuickCapture = vi.fn()
    const controller = new DesktopPresenceController({
      getWindow: () => window,
      onQuickCapture,
      shortcuts,
    })

    expect(controller.start()).toBe(QUICK_CAPTURE_ACCELERATORS[1])
    expect(shortcuts.register).toHaveBeenNthCalledWith(1, QUICK_CAPTURE_ACCELERATORS[0], expect.any(Function))
    expect(shortcuts.register).toHaveBeenNthCalledWith(2, QUICK_CAPTURE_ACCELERATORS[1], expect.any(Function))

    shortcuts.callbacks.get(QUICK_CAPTURE_ACCELERATORS[1])?.()
    expect(onQuickCapture).toHaveBeenCalledWith(window, 'shortcut')

    controller.dispose()
    expect(shortcuts.unregister).toHaveBeenCalledWith(QUICK_CAPTURE_ACCELERATORS[1])
  })

  it('does nothing when the window contract points to a destroyed window', () => {
    const window = createWindow({ isDestroyed: vi.fn(() => true) })
    const onQuickCapture = vi.fn()
    const controller = new DesktopPresenceController({
      getWindow: () => window,
      onQuickCapture,
      shortcuts: createShortcuts([]),
    })

    expect(controller.toggleWindow()).toBe('unavailable')
    expect(controller.quickCapture('shortcut')).toBe(false)
    expect(window.hide).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(onQuickCapture).not.toHaveBeenCalled()
  })
})

describe('close-to-tray policy', () => {
  it('hides only when the tray is available during a normal user close', () => {
    expect(shouldHideWindowOnClose({ hasTray: true, isE2E: false, isQuitting: false })).toBe(true)
    expect(shouldHideWindowOnClose({ hasTray: false, isE2E: false, isQuitting: false })).toBe(false)
    expect(shouldHideWindowOnClose({ hasTray: true, isE2E: false, isQuitting: true })).toBe(false)
    expect(shouldHideWindowOnClose({ hasTray: true, isE2E: true, isQuitting: false })).toBe(false)
  })
})
