import type {
  AxisReviewedSafeWriteReceipt,
} from '../../src/shared/axis-reviewed-proposal-contracts'

export function axisReviewedProposalReceipt(
  overrides: Partial<AxisReviewedSafeWriteReceipt> = {},
): AxisReviewedSafeWriteReceipt {
  return {
    expectedRevision: 1,
    expiresAt: '2026-07-29T08:01:00.000Z',
    files: [{
      fileKey: '1'.repeat(64),
      filePath: 'src/one.ts',
      projectRelativePath: 'src/one.ts',
      proposedContentSha256: '2'.repeat(64),
      state: {
        byteLength: 6,
        contentSha256: '3'.repeat(64),
        fileInstanceSha256: '4'.repeat(64),
        kind: 'exists',
      },
    }],
    issuedAt: '2026-07-29T08:00:00.000Z',
    issuer: 'pivot-main',
    projectId: 'project-1',
    proposalId: 'proposal-1',
    receiptId: 'reviewed-proposal-1',
    runId: 'run-1',
    schemaVersion: 1,
    sessionId: 'session-1',
    signature: '7'.repeat(64),
    taskId: 'task-1',
    ...overrides,
  }
}
