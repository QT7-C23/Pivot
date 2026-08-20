import { describe, expect, it } from 'vitest'
import {
  buildGuardedSafeWriteDraft,
  buildProposalDrafts,
  isGuardedSafeWriteApprovalEligible,
  isProposalCompatible,
} from '../../src/renderer/components/axis-guarded-write-review'
import type { AxisTask } from '../../src/shared/axis-engine-contracts'

describe('Axis guarded write approval', () => {
  it('only admits pending tasks with the exact narrow safe-write capability', () => {
    const task: AxisTask = {
      assignedFiles: ['src/one.ts'],
      dependencies: [],
      estimatedComplexity: 1,
      id: 'write',
      objective: 'Write one file',
      requiredTools: ['fs.safeWrite'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      spawnDepth: 1 as const,
      title: 'Write',
    }
    expect(isGuardedSafeWriteApprovalEligible(task, 'pending')).toBe(true)
    expect(isGuardedSafeWriteApprovalEligible(task, 'running')).toBe(false)
    expect(isGuardedSafeWriteApprovalEligible({
      ...task,
      requiredTools: ['fs.safeWrite', 'term.run'],
    }, 'pending')).toBe(false)
    expect(isGuardedSafeWriteApprovalEligible({
      ...task,
      assignedFiles: [],
    }, 'pending')).toBe(false)
  })

  it('builds one write per authoritative assigned file and ignores extra draft keys', () => {
    expect(buildGuardedSafeWriteDraft(
      ['src/one.ts', 'src/two.ts'],
      {
        'src/one.ts': 'one',
        'src/two.ts': '',
        'src/unassigned.ts': 'forged',
      },
    )).toEqual([
      { content: 'one', filePath: 'src/one.ts' },
      { content: '', filePath: 'src/two.ts' },
    ])
  })

  it('prefills only a proposal bound to the exact run, task, revision and file set', () => {
    const proposal = {
      createdAt: '2026-07-29T08:00:00.000Z',
      expectedRevision: 2,
      files: [{
        filePath: 'src/one.ts',
        originalContent: 'before',
        originalSha256: '1'.repeat(64),
        originalState: 'existing' as const,
        proposedContent: 'after',
      }],
      proposalId: 'proposal-1',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'write',
      usage: { costUsd: 0.001, tokens: 100 },
    }
    expect(isProposalCompatible(
      proposal,
      receipt(),
      'run-1',
      'write',
      2,
      ['src/one.ts'],
    )).toBe(true)
    expect(buildProposalDrafts(proposal)).toEqual({ 'src/one.ts': 'after' })
    expect(isProposalCompatible(
      proposal,
      receipt(),
      'run-1',
      'write',
      3,
      ['src/one.ts'],
    )).toBe(false)
    expect(isProposalCompatible(
      proposal,
      receipt(),
      'run-1',
      'write',
      2,
      ['src/two.ts'],
    )).toBe(false)
    expect(isProposalCompatible(
      proposal,
      { ...receipt(), proposalId: 'proposal-other' },
      'run-1',
      'write',
      2,
      ['src/one.ts'],
    )).toBe(false)
  })
})

function receipt() {
  return {
    expectedRevision: 2,
    expiresAt: '2026-07-29T08:01:00.000Z',
    files: [{
      fileKey: '2'.repeat(64),
      filePath: 'src/one.ts',
      projectRelativePath: 'src/one.ts',
      proposedContentSha256: '3'.repeat(64),
      state: {
        byteLength: 6,
        contentSha256: '1'.repeat(64),
        fileInstanceSha256: '4'.repeat(64),
        kind: 'exists' as const,
      },
    }],
    issuedAt: '2026-07-29T08:00:00.000Z',
    issuer: 'pivot-main' as const,
    projectId: 'project-1',
    proposalId: 'proposal-1',
    receiptId: 'reviewed-proposal-1',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    signature: '5'.repeat(64),
    taskId: 'write',
  }
}
