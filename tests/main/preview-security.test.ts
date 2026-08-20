import { describe, expect, it } from 'vitest'
import { hardenPreviewWebPreferences } from '../../src/main/services/preview-security'

describe('preview guest security', () => {
  it('removes renderer-controlled preload and forces the isolated sandbox contract', () => {
    const preferences = {
      allowRunningInsecureContent: true,
      contextIsolation: false,
      experimentalFeatures: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,
      preload: 'C:\\attacker.js',
      sandbox: false,
      webSecurity: false,
    }

    hardenPreviewWebPreferences(preferences)

    expect(preferences).toMatchObject({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      experimentalFeatures: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
    })
    expect(preferences).not.toHaveProperty('preload')
  })
})
