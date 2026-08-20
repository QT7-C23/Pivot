import type { BrowserWindowConstructorOptions } from 'electron'

export function createMainWindowOptions(
  preloadPath: string,
  version: string,
): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#f3f1ec',
    show: true,
    title: `Pivot ${version}`,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#faf9f6',
      height: 44,
      symbolColor: '#626965',
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      webviewTag: true,
    },
  }
}
