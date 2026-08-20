export interface RevealableWindow {
  focus(): void
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
}

export function revealWindow(window: RevealableWindow): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}
