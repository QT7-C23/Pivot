import type {
  AxisTask,
  AxisTaskRunState,
} from '../../shared/axis-engine-contracts'
import type { AxisGuardedSafeWriteSubmission } from '../../shared/axis-guarded-safe-write-contracts'
import type { AxisSafeWriteProposal } from '../../shared/axis-safe-write-proposal-contracts'
import type { AxisReviewedSafeWriteReceipt } from '../../shared/axis-reviewed-proposal-contracts'

export function isGuardedSafeWriteApprovalEligible(
  task: AxisTask,
  taskStatus: AxisTaskRunState['status'],
): boolean {
  return taskStatus === 'pending'
    && task.requiredTools.length === 1
    && task.requiredTools[0] === 'fs.safeWrite'
    && task.assignedFiles.length >= 1
    && task.assignedFiles.length <= 16
    && new Set(task.assignedFiles).size === task.assignedFiles.length
}

export function buildGuardedSafeWriteDraft(
  assignedFiles: string[],
  drafts: Readonly<Record<string, string>>,
): AxisGuardedSafeWriteSubmission['writes'] {
  return assignedFiles.map((filePath) => ({
    content: drafts[filePath] ?? '',
    filePath,
  }))
}

export function isProposalCompatible(
  proposal: AxisSafeWriteProposal | null,
  receipt: AxisReviewedSafeWriteReceipt | null,
  runId: string,
  taskId: string,
  runRevision: number,
  assignedFiles: string[],
): proposal is AxisSafeWriteProposal {
  if (
    !proposal
    || !receipt
    || proposal.runId !== runId
    || proposal.taskId !== taskId
    || proposal.expectedRevision !== runRevision
    || receipt.runId !== proposal.runId
    || receipt.sessionId !== proposal.sessionId
    || receipt.taskId !== proposal.taskId
    || receipt.proposalId !== proposal.proposalId
    || receipt.expectedRevision !== proposal.expectedRevision
  ) {
    return false
  }
  const assigned = JSON.stringify([...assignedFiles].sort())
  return JSON.stringify(proposal.files.map((file) => file.filePath).sort()) === assigned
    && JSON.stringify(receipt.files.map((file) => file.filePath).sort()) === assigned
}

export function buildProposalDrafts(
  proposal: AxisSafeWriteProposal,
): Record<string, string> {
  return Object.fromEntries(proposal.files.map((file) => [
    file.filePath,
    file.proposedContent,
  ]))
}
