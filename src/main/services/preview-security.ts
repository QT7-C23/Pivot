import type { Session, WebContents, WebPreferences } from 'electron'
import { isAllowedPreviewUrl } from '../../shared/preview-url'

export const PREVIEW_PARTITION = 'pivot-preview'

export function hardenPreviewWebPreferences(preferences: WebPreferences): void {
  delete preferences.preload
  preferences.allowRunningInsecureContent = false
  preferences.contextIsolation = true
  preferences.experimentalFeatures = false
  preferences.nodeIntegration = false
  preferences.nodeIntegrationInSubFrames = false
  preferences.nodeIntegrationInWorker = false
  preferences.sandbox = true
  preferences.webSecurity = true
}

export function configurePreviewHost(contents: WebContents): void {
  contents.on('will-attach-webview', (event, preferences, params) => {
    if (params.partition !== PREVIEW_PARTITION || !isAllowedPreviewUrl(params.src)) {
      event.preventDefault()
      return
    }
    hardenPreviewWebPreferences(preferences)
  })

  contents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(() => ({ action: 'deny' }))
    guest.on('will-navigate', (event, url) => {
      if (!isAllowedPreviewUrl(url)) event.preventDefault()
    })
    guest.on('will-redirect', (event, url) => {
      if (!isAllowedPreviewUrl(url)) event.preventDefault()
    })
  })
}

export function configurePreviewSession(previewSession: Session): void {
  previewSession.setPermissionCheckHandler(() => false)
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  previewSession.on('will-download', (event) => event.preventDefault())
}
