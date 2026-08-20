import electronUpdater, { type AppUpdater } from 'electron-updater'
import type { ApplicationUpdateState } from '../../shared/application-update'

interface UpdateClient {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  on(event: string, listener: (...args: any[]) => void): unknown
  quitAndInstall(): void
}

export interface ApplicationUpdateOptions {
  currentVersion: string
  enabled: boolean
  isPackaged: boolean
  onState?: (state: ApplicationUpdateState) => void
  updater?: UpdateClient
}

export class ApplicationUpdateService {
  private readonly updater: UpdateClient
  private started = false
  private currentState: ApplicationUpdateState

  constructor(private readonly options: ApplicationUpdateOptions) {
    this.updater = options.updater ?? getElectronUpdater()
    this.currentState = {
      currentVersion: options.currentVersion,
      status: options.enabled && options.isPackaged ? 'idle' : 'unavailable',
    }
  }

  get state(): ApplicationUpdateState {
    return { ...this.currentState }
  }

  start(): boolean {
    if (!this.options.enabled || !this.options.isPackaged) return false
    if (this.started) return true
    this.started = true
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
    this.updater.on('checking-for-update', () => this.transition({ status: 'checking' }))
    this.updater.on('update-available', (info: { version: string }) => this.transition({ availableVersion: info.version, progress: 0, status: 'available' }))
    this.updater.on('update-not-available', () => this.transition({ status: 'up-to-date' }))
    this.updater.on('download-progress', (progress: { percent: number }) => this.transition({ progress: clampProgress(progress.percent), status: 'downloading' }))
    this.updater.on('update-downloaded', (info: { version?: string }) => this.transition({ availableVersion: info.version ?? this.currentState.availableVersion, progress: 100, status: 'downloaded' }))
    this.updater.on('error', (error: Error) => this.fail(error))
    this.emit()
    return true
  }

  async check(): Promise<ApplicationUpdateState> {
    if (!this.started) return this.state
    this.transition({ message: undefined, status: 'checking' })
    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      this.fail(error)
    }
    return this.state
  }

  async download(): Promise<ApplicationUpdateState> {
    if (!this.started || this.currentState.status !== 'available') return this.state
    this.transition({ progress: 0, status: 'downloading' })
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      this.fail(error)
    }
    return this.state
  }

  install(): ApplicationUpdateState {
    if (this.currentState.status === 'downloaded') this.updater.quitAndInstall()
    return this.state
  }

  private transition(patch: Partial<ApplicationUpdateState>): void {
    this.currentState = { ...this.currentState, ...patch }
    this.emit()
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.transition({ message, status: 'error' })
  }

  private emit(): void {
    this.options.onState?.(this.state)
  }
}

function clampProgress(percent: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
}

function getElectronUpdater(): AppUpdater {
  return electronUpdater.autoUpdater
}
