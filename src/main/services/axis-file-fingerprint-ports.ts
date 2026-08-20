import type {
  AxisFileFingerprintCaptureRequest,
  AxisFileFingerprintEvidence,
  AxisFileFingerprintVerificationBatch,
  AxisFileFingerprintVerifyRequest,
} from '../../shared/axis-file-fingerprint-contracts'
import type { AxisFileLeaseBinding } from '../../shared/axis-file-lease-contracts'

export interface AxisFileFingerprintCapturePort {
  captureAll(request: AxisFileFingerprintCaptureRequest): Promise<AxisFileFingerprintEvidence[]>
}

export interface AxisFileFingerprintVerificationPort {
  verifyAll(request: AxisFileFingerprintVerifyRequest): Promise<AxisFileFingerprintVerificationBatch>
}

export interface AxisTaskFileFingerprintPort
  extends AxisFileFingerprintCapturePort, AxisFileFingerprintVerificationPort {}

export interface AxisFileFingerprintPortFactory {
  openTaskPort(binding: AxisFileLeaseBinding): AxisTaskFileFingerprintPort
}

export class AxisFileFingerprintOwnershipError extends Error {
  constructor() {
    super('File fingerprint evidence is not owned by the bound task')
    this.name = 'AxisFileFingerprintOwnershipError'
  }
}

export class AxisFileFingerprintProofError extends Error {
  constructor() {
    super('File fingerprint evidence proof is invalid')
    this.name = 'AxisFileFingerprintProofError'
  }
}

export class AxisFileFingerprintUnstableReadError extends Error {
  constructor(projectRelativePath: string) {
    super(`File changed while its fingerprint was being captured: ${projectRelativePath}`)
    this.name = 'AxisFileFingerprintUnstableReadError'
  }
}
