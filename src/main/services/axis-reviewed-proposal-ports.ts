import type { AxisProjectBinding } from '../../shared/axis-project-binding-contracts'
import type {
  AxisReviewedSafeWriteReceipt,
  AxisReviewedSafeWriteReceiptFile,
} from '../../shared/axis-reviewed-proposal-contracts'
import type { AxisSafeWriteProposal } from '../../shared/axis-safe-write-proposal-contracts'
import type { AxisFileFingerprintEvidence } from '../../shared/axis-file-fingerprint-contracts'

export interface AxisReviewedProposalBaseline {
  files: Array<{
    evidence: AxisFileFingerprintEvidence
    filePath: string
  }>
  projectId: string
  runId: string
  sessionId: string
  taskId: string
}

export interface AxisReviewedProposalReceiptIssuerPort {
  capture(input: {
    filePaths: string[]
    project: AxisProjectBinding
    runId: string
    sessionId: string
    taskId: string
  }): Promise<AxisReviewedProposalBaseline>
  issue(input: {
    baseline: AxisReviewedProposalBaseline
    proposal: AxisSafeWriteProposal
  }): Promise<AxisReviewedSafeWriteReceipt>
}

export interface AxisReviewedProposalReceiptVerifierPort {
  verify(input: {
    expectedRevision: number
    project: AxisProjectBinding
    receipt: AxisReviewedSafeWriteReceipt
    runId: string
    sessionId: string
    taskId: string
    writes: Array<{ content: string; filePath: string }>
  }): Promise<AxisVerifiedReviewedProposal>
}

export interface AxisVerifiedReviewedProposal {
  expectedRevision: number
  expiresAt: string
  files: AxisReviewedSafeWriteReceiptFile[]
  projectId: string
  proposalId: string
  receiptId: string
  runId: string
  sessionId: string
  taskId: string
  verified: true
}
