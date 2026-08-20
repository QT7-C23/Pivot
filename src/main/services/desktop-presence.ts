import { revealWindow, type RevealableWindow } from './window-visibility'

export const QUICK_CAPTURE_ACCELERATORS = [
  'Alt+Space',
  'CommandOrControl+Alt+Space',
] as const

export type QuickCaptureSource = 'shortcut' | 'tray'

export interface DesktopPresenceWindow extends RevealableWindow {
  hide(): void
  isVisible(): boolean
}

export interface GlobalShortcutPort {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

export interface DesktopPresenceOptions {
  getWindow: () => DesktopPresenceWindow | null
  onQuickCapture: (window: DesktopPresenceWindow, source: QuickCaptureSource) => void
  shortcuts: GlobalShortcutPort
}

export type WindowToggleResult = 'hidden' | 'revealed' | 'unavailable'

export function shouldHideWindowOnClose(options: {
  hasTray: boolean
  isE2E: boolean
  isQuitting: boolean
}): boolean {
  return options.hasTray && !options.isE2E && !options.isQuitting
}

/**
 * Owns the desktop-presence lifecycle without importing Electron. The main
 * process supplies the window, shortcut and renderer-signal adapters.
 */
export class DesktopPresenceController {
  private registeredAccelerator: string | null = null

  constructor(private readonly options: DesktopPresenceOptions) {}

  start(): string | null {
    if (this.registeredAccelerator) return this.registeredAccelerator

    for (const accelerator of QUICK_CAPTURE_ACCELERATORS) {
      const registered = this.options.shortcuts.register(
        accelerator,
        () => void this.quickCapture('shortcut'),
      )
      if (registered) {
        this.registeredAccelerator = accelerator
        return accelerator
      }
    }
    return null
  }

  toggleWindow(): WindowToggleResult {
    const window = this.availableWindow()
    if (!window) return 'unavailable'
    if (window.isVisible()) {
      window.hide()
      return 'hidden'
    }
    revealWindow(window)
    return 'revealed'
  }

  showWindow(): boolean {
    const window = this.availableWindow()
    if (!window) return false
    revealWindow(window)
    return true
  }

  quickCapture(source: QuickCaptureSource): boolean {
    const window = this.availableWindow()
    if (!window) return false
    revealWindow(window)
    this.options.onQuickCapture(window, source)
    return true
  }

  dispose(): void {
    if (!this.registeredAccelerator) return
    this.options.shortcuts.unregister(this.registeredAccelerator)
    this.registeredAccelerator = null
  }

  private availableWindow(): DesktopPresenceWindow | null {
    const window = this.options.getWindow()
    return window && !window.isDestroyed() ? window : null
  }
}
