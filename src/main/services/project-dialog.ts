import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'

export async function chooseProjectDirectory(options: {
  defaultPath?: string
  window?: BrowserWindow | null
} = {}): Promise<string | null> {
  const result = options.window
    ? await dialog.showOpenDialog(options.window, {
        buttonLabel: 'Open Project',
        defaultPath: options.defaultPath,
        properties: ['openDirectory'],
        title: 'Open Project Folder',
      })
    : await dialog.showOpenDialog({
        buttonLabel: 'Open Project',
        defaultPath: options.defaultPath,
        properties: ['openDirectory'],
        title: 'Open Project Folder',
      })

  if (result.canceled) {
    return null
  }

  return result.filePaths[0] ?? null
}
