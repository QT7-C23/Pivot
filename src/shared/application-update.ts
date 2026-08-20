export type ApplicationUpdateStatus = 'unavailable' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'

export interface ApplicationUpdateState {
  availableVersion?: string
  currentVersion: string
  message?: string
  progress?: number
  status: ApplicationUpdateStatus
}
