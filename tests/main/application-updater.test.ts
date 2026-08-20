import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { ApplicationUpdateService } from '../../src/main/services/application-updater'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn().mockResolvedValue(undefined)
  downloadUpdate = vi.fn().mockResolvedValue([])
  quitAndInstall = vi.fn()
}

describe('ApplicationUpdateService', () => {
  it('does not contact a feed and reports an honest unavailable state without packaged metadata', async () => {
    const updater = new FakeUpdater()
    const service = new ApplicationUpdateService({ currentVersion: '0.1.9', enabled: false, isPackaged: false, updater })

    expect(service.start()).toBe(false)
    expect(service.state).toMatchObject({ currentVersion: '0.1.9', status: 'unavailable' })
    expect(service.state.message).toBeUndefined()
    await service.check()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('uses an explicit check and download state machine without silent downloads', async () => {
    const updater = new FakeUpdater()
    const states: string[] = []
    const service = new ApplicationUpdateService({ currentVersion: '0.1.9', enabled: true, isPackaged: true, onState: (state) => states.push(state.status), updater })

    expect(service.start()).toBe(true)
    expect(updater.autoDownload).toBe(false)
    await service.check()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    updater.emit('update-available', { version: '0.2.0' })
    expect(service.state).toMatchObject({ availableVersion: '0.2.0', status: 'available' })
    await service.download()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    updater.emit('download-progress', { percent: 42.5 })
    expect(service.state).toMatchObject({ progress: 42.5, status: 'downloading' })
    updater.emit('update-downloaded', { version: '0.2.0' })
    expect(service.state.status).toBe('downloaded')
    service.install()
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
    expect(states).toContain('checking')
  })

  it('turns feed failures into a retryable state', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('feed unavailable'))
    const service = new ApplicationUpdateService({ currentVersion: '0.1.9', enabled: true, isPackaged: true, updater })
    service.start()

    await service.check()
    expect(service.state).toMatchObject({ message: 'feed unavailable', status: 'error' })
  })
})
