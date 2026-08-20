import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMainWindowOptions } from '../../src/main/services/main-window-options'

describe('main window startup options', () => {
  it('creates a visible, usable, sandboxed main window', () => {
    const options = createMainWindowOptions('C:\\pivot\\preload.cjs', '0.1.1')

    expect(options).toMatchObject({
      backgroundColor: '#f3f1ec',
      height: 960,
      minHeight: 640,
      minWidth: 900,
      show: true,
      title: 'Pivot 0.1.1',
      titleBarOverlay: {
        color: '#faf9f6',
        height: 44,
        symbolColor: '#626965',
      },
      titleBarStyle: 'hidden',
      width: 1440,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: 'C:\\pivot\\preload.cjs',
        sandbox: true,
        webviewTag: true,
      },
    })
  })

  it('removes Electron\'s default application menu before creating the window', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/main/main.ts'), 'utf8')

    expect(source).toContain('Menu.setApplicationMenu(null)')
  })
})
