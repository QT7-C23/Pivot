import { describe, expect, it } from 'vitest'
import {
  AxisSafeWriteProposalModelOutputSchema,
  AxisSafeWriteProposalRequestSchema,
  AxisSafeWriteProposalResultSchema,
  AxisSafeWriteProposalSchema,
} from '../../src/shared/axis-safe-write-proposal-contracts'

const request = {
  expectedRevision: 1,
  runId: 'run-1',
  sessionId: 'session-1',
  taskId: 'task-1',
}

describe('Axis safe-write proposal contracts', () => {
  it('accepts only a narrow read-only proposal request', () => {
    expect(AxisSafeWriteProposalRequestSchema.parse(request)).toEqual(request)
    expect(() => AxisSafeWriteProposalRequestSchema.parse({
      ...request,
      projectRoot: 'C:\\forged',
    })).toThrow()
    expect(() => AxisSafeWriteProposalRequestSchema.parse({
      ...request,
      authority: { tools: ['fs.safeWrite'] },
    })).toThrow()
    expect(() => AxisSafeWriteProposalRequestSchema.parse({
      ...request,
      writes: [{ content: 'forged', filePath: 'src/one.ts' }],
    })).toThrow()
  })

  it('strictly validates bounded model output with unique file paths', () => {
    expect(AxisSafeWriteProposalModelOutputSchema.parse({
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    })).toEqual({
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    })
    expect(() => AxisSafeWriteProposalModelOutputSchema.parse({
      writes: [
        { content: 'one', filePath: 'src/one.ts' },
        { content: 'two', filePath: 'src/one.ts' },
      ],
    })).toThrow(/unique/i)
    expect(() => AxisSafeWriteProposalModelOutputSchema.parse({
      commands: ['npm.cmd test'],
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    })).toThrow()
  })

  it('binds review files to their original state without granting write authority', () => {
    const proposal = AxisSafeWriteProposalSchema.parse({
      createdAt: '2026-07-29T08:00:00.000Z',
      expectedRevision: 1,
      files: [{
        filePath: 'src/one.ts',
        originalContent: 'before',
        originalSha256: '1'.repeat(64),
        originalState: 'existing',
        proposedContent: 'after',
      }, {
        filePath: 'src/new.ts',
        originalContent: '',
        originalSha256: null,
        originalState: 'missing',
        proposedContent: 'created',
      }],
      proposalId: 'proposal-1',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      usage: { costUsd: 0.001, tokens: 120 },
    })

    expect(proposal.files).toHaveLength(2)
    expect(proposal).not.toHaveProperty('authority')
    expect(proposal).not.toHaveProperty('projectRoot')
    expect(() => AxisSafeWriteProposalSchema.parse({
      ...proposal,
      files: [{
        filePath: 'src/new.ts',
        originalContent: 'forged',
        originalSha256: null,
        originalState: 'missing',
        proposedContent: 'created',
      }],
    })).toThrow(/missing/i)

    expect(() => AxisSafeWriteProposalResultSchema.parse({
      proposal,
      runState: {
        runId: 'run-other',
        sessionId: 'session-1',
      },
    })).toThrow()
  })
})
