import type {
  AxisFileIdentity,
  AxisFileLease,
  AxisFileLeaseAcquireRequest,
  AxisFileLeaseBatchAcquireRequest,
  AxisFileLeaseBatchReleaseRequest,
  AxisFileLeaseBatchRenewRequest,
  AxisFileLeaseBatchVerifyRequest,
  AxisFileLeaseBinding,
  AxisFileLeaseReleaseRequest,
  AxisFileLeaseRenewRequest,
  AxisFileLeaseRunBinding,
  AxisFileLeaseSessionBinding,
} from '../../shared/axis-file-lease-contracts'

export type { AxisFileLeaseBinding } from '../../shared/axis-file-lease-contracts'

export interface AxisProjectFileIdentityPort {
  resolve(binding: AxisFileLeaseBinding, filePath: string): Promise<AxisFileIdentity>
}

export interface AxisFileLeaseReaderPort {
  listOwn(): Promise<AxisFileLease[]>
}

export interface AxisFileLeaseWriterPort {
  acquire(request: AxisFileLeaseAcquireRequest): Promise<AxisFileLease>
  release(request: AxisFileLeaseReleaseRequest): Promise<AxisFileLease>
  renew(request: AxisFileLeaseRenewRequest): Promise<AxisFileLease>
}

export interface AxisFileLeaseCoordinatorPort {
  acquireAll(request: AxisFileLeaseBatchAcquireRequest): Promise<AxisFileLease[]>
  releaseAll(request: AxisFileLeaseBatchReleaseRequest): Promise<AxisFileLease[]>
  renewAll(request: AxisFileLeaseBatchRenewRequest): Promise<AxisFileLease[]>
  verifyAll(request: AxisFileLeaseBatchVerifyRequest): Promise<AxisFileLease[]>
}

export interface AxisTaskFileLeasePort
  extends AxisFileLeaseReaderPort, AxisFileLeaseWriterPort, AxisFileLeaseCoordinatorPort {}

export interface AxisFileLeasePortFactory {
  openTaskPort(binding: AxisFileLeaseBinding): AxisTaskFileLeasePort
}

export interface AxisFileLeaseAdminPort {
  close(): void
  listActive(projectId: string): Promise<AxisFileLease[]>
  releaseForRun(binding: AxisFileLeaseRunBinding): number
  releaseForSession(binding: AxisFileLeaseSessionBinding): number
}

export class AxisFileLeaseConflictError extends Error {
  readonly conflictingLease: AxisFileLease

  constructor(conflictingLease: AxisFileLease) {
    super(
      `File is leased by task ${conflictingLease.taskId} until ${conflictingLease.expiresAt}: `
      + conflictingLease.projectRelativePath,
    )
    this.name = 'AxisFileLeaseConflictError'
    this.conflictingLease = conflictingLease
  }
}
