import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AxisExternalFileFingerprintAdapter } from '../../src/main/services/axis-external-file-fingerprint-adapter'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { AxisReviewedProposalReceiptService } from '../../src/main/services/axis-reviewed-proposal-receipt'
import type { AxisProjectBindingReaderPort } from '../../src/main/services/axis-project-binding-ports'
import type { AxisSafeWriteProposal } from '../../src/shared/axis-safe-write-proposal-contracts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })))
})

describe('AxisReviewedProposalReceiptService', () => {
  it('issues and verifies an exact Main-signed content and fingerprint binding', async () => {
    const root = await project()
    const service = createService(root)
    const proposal = proposalValue()

    const baseline = await service.capture({
      filePaths: proposal.files.map((file) => file.filePath),
      project: projectBinding(root),
      runId: proposal.runId,
      sessionId: proposal.sessionId,
      taskId: proposal.taskId,
    })
    const receipt = await service.issue({ baseline, proposal })
    await expect(service.verify({
      expectedRevision: 2,
      project: projectBinding(root),
      receipt,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [
        { content: 'after', filePath: 'src/one.ts' },
        { content: 'created', filePath: 'src/new.ts' },
      ],
    })).resolves.toMatchObject({
      expectedRevision: 2,
      projectId: 'project-1',
      proposalId: 'proposal-1',
      verified: true,
    })
    expect(receipt.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'src/one.ts',
        state: expect.objectContaining({ kind: 'exists' }),
      }),
      expect.objectContaining({
        filePath: 'src/new.ts',
        state: { kind: 'missing' },
      }),
    ]))
  })

  it('rejects tampering, edited writes, stale ownership and expiry', async () => {
    const root = await project()
    const service = createService(root)
    const proposal = proposalValue()
    const baseline = await service.capture({
      filePaths: proposal.files.map((file) => file.filePath),
      project: projectBinding(root),
      runId: proposal.runId,
      sessionId: proposal.sessionId,
      taskId: proposal.taskId,
    })
    const receipt = await service.issue({ baseline, proposal })
    const verify = (overrides: Record<string, unknown> = {}) => service.verify({
      expectedRevision: 2,
      project: projectBinding(root),
      receipt,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [
        { content: 'after', filePath: 'src/one.ts' },
        { content: 'created', filePath: 'src/new.ts' },
      ],
      ...overrides,
    })

    await expect(verify({
      receipt: { ...receipt, signature: '0'.repeat(64) },
    })).rejects.toThrow(/signature/i)
    await expect(verify({
      writes: [
        { content: 'edited', filePath: 'src/one.ts' },
        { content: 'created', filePath: 'src/new.ts' },
      ],
    })).rejects.toThrow(/content/i)
    await expect(verify({ expectedRevision: 3 })).rejects.toThrow(/revision/i)
    await expect(verify({ taskId: 'task-other' })).rejects.toThrow(/binding/i)

    const expired = createService(root, () => new Date('2026-07-29T08:02:00.000Z'))
    await expect(expired.verify({
      expectedRevision: 2,
      project: projectBinding(root),
      receipt,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [
        { content: 'after', filePath: 'src/one.ts' },
        { content: 'created', filePath: 'src/new.ts' },
      ],
    })).rejects.toThrow(/expired/i)
  })

  it('rejects modified, deleted, created and same-content replaced baselines', async () => {
    for (const change of ['modified', 'deleted', 'created', 'replaced'] as const) {
      const root = await project()
      const service = createService(root)
      const proposal = proposalValue()
      const baseline = await service.capture({
        filePaths: proposal.files.map((file) => file.filePath),
        project: projectBinding(root),
        runId: proposal.runId,
        sessionId: proposal.sessionId,
        taskId: proposal.taskId,
      })
      const receipt = await service.issue({ baseline, proposal })
      const existingPath = path.join(root, 'src', 'one.ts')
      const newPath = path.join(root, 'src', 'new.ts')
      if (change === 'modified') await writeFile(existingPath, 'changed', 'utf8')
      if (change === 'deleted') await unlink(existingPath)
      if (change === 'created') await writeFile(newPath, 'external', 'utf8')
      if (change === 'replaced') {
        await unlink(existingPath)
        await writeFile(existingPath, 'before', 'utf8')
      }

      await expect(service.verify({
        expectedRevision: 2,
        project: projectBinding(root),
        receipt,
        runId: 'run-1',
        sessionId: 'session-1',
        taskId: 'task-1',
        writes: [
          { content: 'after', filePath: 'src/one.ts' },
          { content: 'created', filePath: 'src/new.ts' },
        ],
      })).rejects.toThrow(/baseline changed/i)
    }
  })
})

function createService(
  root: string,
  clock: () => Date = () => new Date('2026-07-29T08:00:00.000Z'),
) {
  const projects = projectPort(root)
  const identity = new AxisMainProjectFileIdentityAdapter({
    projectBindings: projects,
  })
  return new AxisReviewedProposalReceiptService({
    clock,
    fingerprints: new AxisExternalFileFingerprintAdapter({
      clock,
      identity,
      projectBindings: projects,
      proofSecret: Buffer.alloc(32, 1),
    }),
    idFactory: () => 'reviewed-proposal-1',
    identity,
    secret: Buffer.alloc(32, 2),
  })
}

function proposalValue(): AxisSafeWriteProposal {
  return {
    createdAt: '2026-07-29T08:00:00.000Z',
    expectedRevision: 2,
    files: [{
      filePath: 'src/one.ts',
      originalContent: 'before',
      originalSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
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
  }
}

function projectBinding(root: string) {
  return {
    boundAt: '2026-07-29T00:00:00.000Z',
    projectId: 'project-1',
    projectRoot: root,
    schemaVersion: 1 as const,
    sessionId: 'session-1',
  }
}

function projectPort(root: string): AxisProjectBindingReaderPort {
  return {
    findBySession(sessionId) {
      return sessionId === 'session-1' ? projectBinding(root) : null
    },
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pivot-reviewed-proposal-'))
  temporaryRoots.push(root)
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'one.ts'), 'before', 'utf8')
  return root
}
