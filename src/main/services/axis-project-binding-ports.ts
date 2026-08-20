import type {
  AxisProjectBinding,
  AxisProjectBindRequest,
} from '../../shared/axis-project-binding-contracts'

export interface AxisProjectBindingReaderPort {
  findBySession(sessionId: string): AxisProjectBinding | null
}

export interface AxisProjectBindingPortFactory {
  openReaderPort(): AxisProjectBindingReaderPort
}

export interface AxisProjectBindingAdminPort {
  bind(request: AxisProjectBindRequest): Promise<AxisProjectBinding>
  close(): void
  unbindSession(sessionId: string): boolean
}
