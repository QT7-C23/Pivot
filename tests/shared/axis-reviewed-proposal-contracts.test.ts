import { describe, expect, it } from 'vitest'
import {
  AxisReviewedSafeWriteReceiptSchema,
} from '../../src/shared/axis-reviewed-proposal-contracts'
import {
  AxisGuardedSafeWriteSubmissionSchema,
} from '../../src/shared/axis-guarded-safe-write-contracts'

const receipt = {
  expectedRevision: 2,
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
      kind: 'exists' as const,
    },
  }, {
    fileKey: '5'.repeat(64),
    filePath: 'src/new.ts',
    projectRelativePath: 'src/new.ts',
    proposedContentSha256: '6'.repeat(64),
    state: { kind: 'missing' as const },
  }],
  issuedAt: '2026-07-29T08:00:00.000Z',
  issuer: 'pivot-main' as const,
  projectId: 'project-1',
  proposalId: 'proposal-1',
  receiptId: 'reviewed-proposal-1',
  runId: 'run-1',
  schemaVersion: 1 as const,
  sessionId: 'session-1',
  signature: '7'.repeat(64),
  taskId: 'task-1',
}

describe('Axis reviewed safe-write proposal receipt contracts', () => {
  it('accepts only a strict Main-issued receipt with unique file identities', () => {
    expect(AxisReviewedSafeWriteReceiptSchema.parse(receipt)).toEqual(receipt)
    expect(() => AxisReviewedSafeWriteReceiptSchema.parse({
      ...receipt,
      projectRoot: 'C:\\forged',
    })).toThrow()
    expect(() => AxisReviewedSafeWriteReceiptSchema.parse({
      ...receipt,
      authority: { tools: ['fs.safeWrite'] },
    })).toThrow()
    expect(() => AxisReviewedSafeWriteReceiptSchema.parse({
      ...receipt,
      files: [receipt.files[0], receipt.files[0]],
    })).toThrow(/duplicate/i)
    expect(() => AxisReviewedSafeWriteReceiptSchema.parse({
      ...receipt,
      expiresAt: receipt.issuedAt,
    })).toThrow(/expiry/i)
  })

  it('requires the receipt on every guarded submission and rejects forged siblings', () => {
    const submission = {
      expectedRevision: 2,
      reviewedProposalReceipt: receipt,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [
        { content: 'after', filePath: 'src/one.ts' },
        { content: 'created', filePath: 'src/new.ts' },
      ],
    }
    expect(AxisGuardedSafeWriteSubmissionSchema.parse(submission)).toEqual(submission)
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...submission,
      reviewedProposalReceipt: undefined,
    })).toThrow()
    expect(() => AxisGuardedSafeWriteSubmissionSchema.parse({
      ...submission,
      reviewedProposalProof: receipt.signature,
    })).toThrow()
  })
})
