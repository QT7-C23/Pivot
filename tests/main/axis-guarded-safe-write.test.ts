import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxisAuthorityAuditRegistry } from '../../src/main/services/axis-authority-audit-registry'
import { AxisCheckpointReceiptIssuer } from '../../src/main/services/axis-checkpoint-receipt-issuer'
import { AxisExternalFileFingerprintAdapter } from '../../src/main/services/axis-external-file-fingerprint-adapter'
import { AxisExecutionAuthorityService } from '../../src/main/services/axis-execution-authority'
import { AxisExecutionTransactionJournal } from '../../src/main/services/axis-execution-transaction-journal'
import {
  AxisGuardedSafeWriteHarness,
  type AxisGuardedSafeWriteEvidencePort,
} from '../../src/main/services/axis-guarded-safe-write'
import type {
  AxisFileFingerprintPortFactory,
  AxisTaskFileFingerprintPort,
} from '../../src/main/services/axis-file-fingerprint-ports'
import type {
  AxisFileLeaseBinding,
  AxisFileLeasePortFactory,
  AxisTaskFileLeasePort,
} from '../../src/main/services/axis-file-lease-ports'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { AxisMainPermissionGrantCollector, type AxisToolPermissionPort } from '../../src/main/services/axis-permission-grant-collector'
import { AxisPhysicalRollbackExecutor } from '../../src/main/services/axis-physical-rollback-executor'
import { AxisSafeWriteWorker, type AxisFileWritePort } from '../../src/main/services/axis-safe-write-worker'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { writeTextFile } from '../../src/main/services/file-system'
import { SqliteAxisFileLeaseStore } from '../../src/main/services/sqlite-axis-file-lease-store'
import { projectBindingReader } from '../fixtures/axis-project-binding'
import type { AxisGateBatchResult, AxisTask } from '../../src/shared/axis-engine-contracts'
import type { AxisVerifiedReviewedProposal } from '../../src/main/services/axis-reviewed-proposal-ports'
import type { AxisSemanticReviewPort } from '../../src/main/services/axis-semantic-review-coordinator'
import type { AxisSemanticReviewSnapshotPort } from '../../src/main/services/axis-semantic-review-snapshot'

let tempRoot = ''
let existingFile = ''
let newFile = ''
const closables: Array<{ close(): void }> = []

beforeEach(async () => {
  const requestedRoot = path.join(os.tmpdir(), `pivot-axis-safe-write-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(requestedRoot, { recursive: true })
  tempRoot = await realpath(requestedRoot)
  existingFile = path.join(tempRoot, 'existing.ts')
  newFile = path.join(tempRoot, 'new.ts')
  await writeFile(existingFile, 'before')
})

afterEach(async () => {
  closables.splice(0).forEach((resource) => resource.close())
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Axis guarded safe-write execution', () => {
  it('is independently default-off and blocks before permission or file work', async () => {
    const permission = allowPermission()
    const writer = { write: vi.fn(writeTextFile) }
    const { harness } = createHarness({ enabled: false, permission, writer })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ blockReason: 'feature-disabled', mode: 'safe-write', status: 'blocked' })
    expect(permission.request).not.toHaveBeenCalled()
    expect(writer.write).not.toHaveBeenCalled()
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('blocks a security-sensitive file before permission when the runtime lacks the security Gate', async () => {
    const permission = allowPermission()
    const writer = { write: vi.fn(writeTextFile) }
    const { harness } = createHarness({ enabled: true, permission, writer })
    const securityFile = path.join(tempRoot, 'security-policy.ts')

    const result = await harness.execute({
      ...request(),
      reviewedProposal: reviewedProposal([{ content: 'secure', filePath: securityFile }]),
      task: {
        ...task(),
        assignedFiles: [securityFile],
        requiredGates: ['compile', 'test', 'security'],
        requiresHumanReview: true,
      },
      writes: [{ content: 'secure', filePath: securityFile }],
    })

    expect(result).toMatchObject({
      blockReason: 'authority-failed',
      status: 'blocked',
    })
    expect(result.detail).toMatch(/required security Gate is unavailable/i)
    expect(permission.request).not.toHaveBeenCalled()
    expect(writer.write).not.toHaveBeenCalled()
    await expect(readFile(securityFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rolls back when a Gate Port omits a required Gate from passed evidence', async () => {
    const incompleteGates = gatePort('passed')
    incompleteGates.supports = () => true
    const { harness } = createHarness({ enabled: true, gates: incompleteGates })

    const result = await harness.execute({
      ...request(),
      task: {
        ...task(),
        requiredGates: ['compile', 'test', 'security'],
        requiresHumanReview: true,
      },
    })

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    expect(result.detail).toMatch(/required Gate evidence/i)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rolls back after command Gates pass when semantic review rejects the transaction', async () => {
    const review = {
      review: vi.fn(async () => ({ decisions: [], evidence: [], requiredAction: 'retry', status: 'failed' as const })),
    } as unknown as AxisSemanticReviewPort
    const snapshots: AxisSemanticReviewSnapshotPort = {
        async create() {
          return {
            afterFileLineCounts: { [existingFile]: 1 },
          changedFiles: [{ afterSha256: sha256('after-existing'), beforeSha256: sha256('before'), filePath: existingFile }],
          diff: '-before\n+after-existing',
          diffSha256: sha256('-before\n+after-existing'),
          objective: 'Update files',
          requireSecurity: false,
        }
      },
    }
    const { harness } = createHarness({ enabled: true, semanticReview: review, semanticReviewSnapshots: snapshots })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    expect(result.detail).toMatch(/semantic review rejected/i)
    expect(review.review).toHaveBeenCalledOnce()
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes every authorized file only after checkpoints and a durable worker-started transaction', async () => {
    const events: string[] = []
    const audit = tracked(new AxisAuthorityAuditRegistry())
    const transactions = tracked(new AxisExecutionTransactionJournal(':memory:', { clock: tickingClock() }))
    const { harness, leaseStore } = createHarness({
      audit,
      enabled: true,
      events,
      transactions,
    })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ blockReason: null, mode: 'safe-write', status: 'completed' })
    expect(result.writeReceipts).toHaveLength(2)
    expect(result.completionEvidence).toMatchObject({
      authority: 'pivot-main',
      checkpointReceipts: result.checkpointReceipts,
      gateEvidenceIds: result.gateResult?.evidenceIds,
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'completed',
      taskId: 'task-1',
      transactionRevision: 3,
      writes: result.writeReceipts.map(({ contentSha256, envelopeId, filePath }) => ({
        contentSha256,
        envelopeId,
        filePath,
      })),
    })
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('after-existing')
    await expect(readFile(newFile, 'utf8')).resolves.toBe('after-new')
    const [completedTransaction] = transactions.listForRun('run-1')
    expect(completedTransaction).toMatchObject({ revision: 3, status: 'completed' })
    expect(result.completionEvidence).toMatchObject({
      completedAt: completedTransaction.updatedAt,
      transactionId: completedTransaction.transactionId,
      transactionRevision: completedTransaction.revision,
    })
    expect(audit.list('run-1').map((entry) => entry.type)).toEqual([
      'authority-issued',
      'mutation-written',
      'mutation-written',
    ])
    expect(audit.list('run-1')[0]).toMatchObject({
      envelope: {
        fileFingerprintEvidence: [{ projectId: 'project-1' }, { projectId: 'project-1' }],
        fileLeaseEvidence: [{ projectId: 'project-1' }, { projectId: 'project-1' }],
        projectId: 'project-1',
      },
    })
    expect(events).toEqual([
      'lease-acquire',
      'fingerprint-capture',
      'checkpoint',
      'authority',
      'lease-verify',
      'fingerprint-verify',
      'write',
      'write',
      'lease-release',
    ])
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('normalizes project-relative planner files at the Main authority boundary', async () => {
    const permission = allowPermission()
    const { harness } = createHarness({ enabled: true, permission })
    const relativeTask: AxisTask = {
      ...task(),
      assignedFiles: ['existing.ts', 'new.ts'],
    }

    const result = await harness.execute({
      ...request(),
      reviewedProposal: reviewedProposal([
        { content: 'after-existing', filePath: 'existing.ts' },
        { content: 'after-new', filePath: 'new.ts' },
      ]),
      task: relativeTask,
      writes: [
        { content: 'after-existing', filePath: 'existing.ts' },
        { content: 'after-new', filePath: 'new.ts' },
      ],
    })

    expect(result).toMatchObject({ blockReason: null, status: 'completed' })
    expect(permission.request).toHaveBeenCalledWith({
      assignedFiles: [existingFile, newFile],
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      toolName: 'fs.safeWrite',
    }, undefined)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('after-existing')
    await expect(readFile(newFile, 'utf8')).resolves.toBe('after-new')
  })

  it('physically rolls back the whole batch when a later file write fails', async () => {
    let writeCount = 0
    const writer: AxisFileWritePort = {
      async write(projectRoot, filePath, content) {
        writeCount += 1
        if (writeCount === 2) throw new Error('second write failed')
        await writeTextFile(projectRoot, filePath, content)
      },
    }
    const transactions = tracked(new AxisExecutionTransactionJournal(':memory:', { clock: tickingClock() }))
    const { harness, leaseStore } = createHarness({ enabled: true, transactions, writer })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    expect(result.writeReceipts).toHaveLength(1)
    expect(result.rollbackOutcomes).toHaveLength(2)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(transactions.listForRun('run-1')).toEqual([expect.objectContaining({ revision: 5, status: 'rolled-back' })])
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('rolls back the first write when cancellation arrives between files', async () => {
    const controller = new AbortController()
    const writer: AxisFileWritePort = {
      async write(projectRoot, filePath, content) {
        await writeTextFile(projectRoot, filePath, content)
        controller.abort()
      },
    }
    const { harness, leaseStore } = createHarness({ enabled: true, writer })

    const result = await harness.execute({ ...request(), signal: controller.signal })

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('fails closed and rolls back when authority expires during the batch', async () => {
    let now = new Date('2026-07-26T08:00:00.000Z')
    const writer: AxisFileWritePort = {
      async write(projectRoot, filePath, content) {
        await writeTextFile(projectRoot, filePath, content)
        now = new Date('2026-07-26T08:02:00.000Z')
      },
    }
    const { harness, leaseStore } = createHarness({ clock: () => now, enabled: true, writer })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    expect(result.detail).toMatch(/expired/i)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('rolls back successful writes when the completion journal cannot commit', async () => {
    const transactions = tracked(new AxisExecutionTransactionJournal(':memory:', { clock: tickingClock() }))
    vi.spyOn(transactions, 'markCompleted').mockImplementation(() => {
      throw new Error('journal completion failed')
    })
    const { harness, leaseStore } = createHarness({ enabled: true, transactions })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    expect(result.completionEvidence).toBeNull()
    expect(result.detail).toMatch(/journal completion failed/i)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('rolls back every write when Gate 1 rejects the transaction', async () => {
    const transactions = tracked(new AxisExecutionTransactionJournal(':memory:', { clock: tickingClock() }))
    const gates = gatePort('failed')
    const { harness, leaseStore } = createHarness({ enabled: true, gates, transactions })

    const result = await harness.execute(request())

    expect(result).toMatchObject({
      completionEvidence: null,
      gateResult: { status: 'failed' },
      status: 'failed-rolled-back',
    })
    expect(result.detail).toMatch(/Gate 1 rejected/i)
    expect(gates.run).toHaveBeenCalledTimes(1)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(transactions.listForRun('run-1')).toEqual([expect.objectContaining({ revision: 5, status: 'rolled-back' })])
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it.each([
    ['modified', async () => writeFile(existingFile, 'external modification')],
    ['deleted', async () => rm(existingFile)],
    ['created', async () => writeFile(newFile, 'external creation')],
    ['replaced', async () => {
      await rename(existingFile, `${existingFile}.original`)
      await writeFile(existingFile, 'before')
    }],
  ])('blocks an externally %s file after Checkpoint without rollback or mutation', async (
    _case,
    mutate,
  ) => {
    const writer = { write: vi.fn(writeTextFile) }
    const transactions = tracked(new AxisExecutionTransactionJournal(':memory:', {
      clock: tickingClock(),
    }))
    const { harness, leaseStore } = createHarness({
      afterCheckpointBatch: mutate,
      enabled: true,
      transactions,
      writer,
    })

    const result = await harness.execute(request())

    expect(result).toMatchObject({
      blockReason: 'external-change',
      status: 'blocked',
      writeReceipts: [],
    })
    expect(writer.write).not.toHaveBeenCalled()
    expect(transactions.listForRun('run-1')).toEqual([])
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('blocks a review-baseline race after verification and Lease acquisition before Checkpoint', async () => {
    const events: string[] = []
    const writer = { write: vi.fn(writeTextFile) }
    const guardedRequest = request()
    const { harness, leaseStore } = createHarness({
      enabled: true,
      events,
      writer,
    })
    await writeFile(existingFile, 'changed after receipt verification', 'utf8')

    const result = await harness.execute(guardedRequest)

    expect(result).toMatchObject({
      blockReason: 'external-change',
      status: 'blocked',
      writeReceipts: [],
    })
    expect(events).toEqual([
      'lease-acquire',
      'fingerprint-capture',
      'lease-release',
    ])
    expect(writer.write).not.toHaveBeenCalled()
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('releases every acquired Lease when Checkpoint creation blocks execution', async () => {
    const { harness, leaseStore } = createHarness({
      checkpointFailure: true,
      enabled: true,
    })

    const result = await harness.execute(request())

    expect(result).toMatchObject({
      blockReason: 'checkpoint-failed',
      status: 'blocked',
    })
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('rolls back writes when Blackboard precommit evidence cannot be persisted', async () => {
    const transactions = tracked(new AxisExecutionTransactionJournal(':memory:', {
      clock: tickingClock(),
    }))
    const { harness, leaseStore } = createHarness({
      blackboardEvidence: {
        recordPrecommit: vi.fn(async () => {
          throw new Error('blackboard storage unavailable')
        }),
      },
      enabled: true,
      transactions,
    })

    const result = await harness.execute(request())

    expect(result).toMatchObject({
      detail: 'blackboard storage unavailable',
      status: 'failed-rolled-back',
    })
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(stat(newFile)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(transactions.listForRun('run-1')).toMatchObject([{
      status: 'rolled-back',
    }])
    expect(await leaseStore.listActive('project-1')).toEqual([])
  })

  it('rejects wrong-mode authority and content digest mismatches before file I/O', async () => {
    const writer = { write: vi.fn(writeTextFile) }
    const authority = new AxisExecutionAuthorityService({
      clock: () => new Date('2026-07-26T08:00:00.000Z'),
      projectBindings: projectBindingReader(tempRoot),
      realExecutionEnabled: () => true,
      secret: 'a'.repeat(32),
    })
    const worker = new AxisSafeWriteWorker({ authority, writer })
    const issueInput = {
      checkpointReceipts: [
        { checkpointId: 'checkpoint-1', filePath: existingFile, priorState: 'existing-file' as const, rollbackAction: 'restore-checkpoint' as const },
        { checkpointId: null, filePath: newFile, priorState: 'new-file' as const, rollbackAction: 'delete-created-file' as const },
      ],
      grantedFilePaths: [existingFile, newFile],
      grantedTools: ['fs.safeWrite'],
      projectRoot: tempRoot,
      runId: 'run-1',
      sessionId: 'session-1',
      task: task(),
    }
    const binding = { projectRoot: tempRoot, runId: 'run-1', sessionId: 'session-1', taskId: 'task-1' }
    const fakeEnvelope = await authority.issue(issueInput)
    const safeEnvelope = await authority.issue({
      ...issueInput,
      ...safeWriteEvidenceForFiles(),
      mode: 'safe-write',
      projectId: 'project-1',
    })
    const correctIntent = {
      content: 'after-existing',
      contentSha256: sha256('after-existing'),
      filePath: existingFile,
      operation: 'write' as const,
      toolName: 'fs.safeWrite',
    }

    await expect(worker.execute({ binding, envelope: fakeEnvelope, intent: correctIntent })).rejects.toThrow(/authority mode/i)
    await expect(worker.execute({
      binding,
      envelope: safeEnvelope,
      intent: { ...correctIntent, contentSha256: sha256('different-content') },
    })).rejects.toThrow(/digest/i)
    expect(writer.write).not.toHaveBeenCalled()
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
  })
})

function createHarness(options: {
  afterCheckpointBatch?: () => Promise<void>
  audit?: AxisAuthorityAuditRegistry
  blackboardEvidence?: AxisGuardedSafeWriteEvidencePort
  checkpointFailure?: boolean
  clock?: () => Date
  enabled: boolean
  events?: string[]
  gates?: ReturnType<typeof gatePort>
  permission?: AxisToolPermissionPort
  semanticReview?: AxisSemanticReviewPort
  semanticReviewSnapshots?: AxisSemanticReviewSnapshotPort
  transactions?: AxisExecutionTransactionJournal
  writer?: AxisFileWritePort
}) {
  const clock = options.clock ?? (() => new Date('2026-07-26T08:00:00.000Z'))
  const checkpoints = tracked(new FileCheckpointStore())
  const transactions = options.transactions ?? tracked(new AxisExecutionTransactionJournal(':memory:', { clock: tickingClock() }))
  const projectBindings = projectBindingReader(tempRoot)
  const identity = new AxisMainProjectFileIdentityAdapter({ projectBindings })
  const leaseStore = tracked(new SqliteAxisFileLeaseStore(identity, ':memory:', { clock }))
  const fingerprintAdapter = new AxisExternalFileFingerprintAdapter({
    clock,
    evidenceTtlMs: 5 * 60_000,
    identity,
    projectBindings,
    proofSecret: Buffer.alloc(32, 9),
  })
  const authority = new AxisExecutionAuthorityService({
    audit: options.audit,
    clock,
    projectBindings,
    realExecutionEnabled: () => options.enabled,
    secret: 'a'.repeat(32),
    ttlMs: 60_000,
  })
  if (options.events) {
    const issue = authority.issue.bind(authority)
    vi.spyOn(authority, 'issue').mockImplementation(async (input) => {
      options.events!.push('authority')
      return issue(input)
    })
  }
  const checkpointIssuer = new AxisCheckpointReceiptIssuer({
    checkpoints: {
      create: async (sessionId, projectRoot, filePath) => {
        if (options.checkpointFailure) throw new Error('checkpoint storage unavailable')
        const checkpoint = await checkpoints.create(sessionId, projectRoot, filePath)
        options.events?.push('checkpoint')
        return checkpoint
      },
    },
    clock,
  })
  if (options.afterCheckpointBatch) {
    const issue = checkpointIssuer.issue.bind(checkpointIssuer)
    vi.spyOn(checkpointIssuer, 'issue').mockImplementation(async (input) => {
      const batch = await issue(input)
      await options.afterCheckpointBatch!()
      return batch
    })
  }
  const writer = tracedWriter(options.writer, options.events)
  return {
    harness: new AxisGuardedSafeWriteHarness({
      authority,
      blackboardEvidence: options.blackboardEvidence,
      checkpointIssuer,
      feature: { isRealExecutionEnabled: () => options.enabled },
      fileFingerprints: tracedFingerprintFactory(fingerprintAdapter, options.events),
      fileLeases: tracedLeaseFactory(leaseStore, options.events),
      gates: options.gates ?? gatePort('passed'),
      grantCollector: new AxisMainPermissionGrantCollector({
        clock,
        permissions: options.permission ?? allowPermission(),
        projectRootForSession: (sessionId) => (
          projectBindings.findBySession(sessionId)?.projectRoot ?? null
        ),
      }),
      leaseTtlMs: 5 * 60_000,
      projectBindings,
      rollback: new AxisPhysicalRollbackExecutor({ checkpoints }),
      semanticReview: options.semanticReview,
      semanticReviewSnapshots: options.semanticReviewSnapshots,
      transactions,
      worker: new AxisSafeWriteWorker({ audit: options.audit, authority, clock, writer }),
    }),
    leaseStore,
  }
}

function request() {
  const writes = [
    { content: 'after-existing', filePath: existingFile },
    { content: 'after-new', filePath: newFile },
  ]
  return {
    projectRoot: tempRoot,
    reviewedProposal: reviewedProposal(writes),
    runId: 'run-1',
    sessionId: 'session-1',
    task: task(),
    writes,
  }
}

function reviewedProposal(
  writes: Array<{ content: string; filePath: string }>,
): AxisVerifiedReviewedProposal {
  const files = writes.map(({ content, filePath }) => {
    const resolved = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(tempRoot, filePath))
    const projectRelativePath = path.relative(tempRoot, resolved).replaceAll('\\', '/')
    const canonicalKeyInput = process.platform === 'win32'
      ? resolved.toLocaleLowerCase('en-US')
      : resolved
    const state = existsSync(resolved)
      ? (() => {
          const fileStats = statSync(resolved, { bigint: true })
          const bytes = readFileSync(resolved)
          return {
            byteLength: bytes.byteLength,
            contentSha256: createHash('sha256').update(bytes).digest('hex'),
            fileInstanceSha256: sha256(
              `${fileStats.dev}:${fileStats.ino}:${fileStats.birthtimeNs}`,
            ),
            kind: 'exists' as const,
          }
        })()
      : { kind: 'missing' as const }
    return {
      fileKey: sha256(canonicalKeyInput),
      filePath,
      projectRelativePath,
      proposedContentSha256: sha256(content),
      state,
    }
  })
  return {
    expectedRevision: 1,
    expiresAt: '2026-07-26T08:05:00.000Z',
    files,
    projectId: 'project-1',
    proposalId: 'proposal-1',
    receiptId: 'reviewed-proposal-1',
    runId: 'run-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    verified: true,
  }
}

function task(): AxisTask {
  return {
    assignedFiles: [existingFile, newFile],
    dependencies: [],
    estimatedComplexity: 3,
    id: 'task-1',
    objective: 'Safely write an authorized file batch',
    requiredTools: ['fs.safeWrite'],
    requiredGates: ['compile', 'test'],
    requiresHumanReview: false,
    spawnDepth: 1,
    title: 'Safe write',
  }
}

function safeWriteEvidenceForFiles() {
  const capturedAt = '2026-07-26T08:00:00.000Z'
  const expiresAt = '2026-07-26T08:05:00.000Z'
  const ownership = {
    projectId: 'project-1',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    taskId: 'task-1',
  }
  const existingFileKey = 'b'.repeat(64)
  const newFileKey = 'c'.repeat(64)
  return {
    fileFingerprintEvidence: [{
      ...ownership,
      capturedAt,
      evidenceId: 'fingerprint-existing',
      expiresAt,
      fileKey: existingFileKey,
      projectRelativePath: 'existing.ts',
      proof: 'p'.repeat(43),
      state: {
        byteLength: 6,
        contentSha256: sha256('before'),
        fileInstanceSha256: 'd'.repeat(64),
        kind: 'exists' as const,
      },
    }, {
      ...ownership,
      capturedAt,
      evidenceId: 'fingerprint-new',
      expiresAt,
      fileKey: newFileKey,
      projectRelativePath: 'new.ts',
      proof: 'q'.repeat(43),
      state: { kind: 'missing' as const },
    }],
    fileLeaseEvidence: [{
      ...ownership,
      acquiredAt: capturedAt,
      expiresAt,
      fileKey: existingFileKey,
      leaseId: 'lease-existing',
      projectRelativePath: 'existing.ts',
      status: 'active' as const,
      updatedAt: capturedAt,
      version: 1,
    }, {
      ...ownership,
      acquiredAt: capturedAt,
      expiresAt,
      fileKey: newFileKey,
      leaseId: 'lease-new',
      projectRelativePath: 'new.ts',
      status: 'active' as const,
      updatedAt: capturedAt,
      version: 1,
    }],
  }
}

function tracedLeaseFactory(
  factory: AxisFileLeasePortFactory,
  events?: string[],
): AxisFileLeasePortFactory {
  if (!events) return factory
  return {
    openTaskPort(binding: AxisFileLeaseBinding): AxisTaskFileLeasePort {
      const port = factory.openTaskPort(binding)
      return Object.freeze({
        ...port,
        acquireAll: async (request: Parameters<AxisTaskFileLeasePort['acquireAll']>[0]) => {
          events.push('lease-acquire')
          return port.acquireAll(request)
        },
        releaseAll: async (request: Parameters<AxisTaskFileLeasePort['releaseAll']>[0]) => {
          events.push('lease-release')
          return port.releaseAll(request)
        },
        verifyAll: async (request: Parameters<AxisTaskFileLeasePort['verifyAll']>[0]) => {
          events.push('lease-verify')
          return port.verifyAll(request)
        },
      })
    },
  }
}

function tracedFingerprintFactory(
  factory: AxisFileFingerprintPortFactory,
  events?: string[],
): AxisFileFingerprintPortFactory {
  if (!events) return factory
  return {
    openTaskPort(binding: AxisFileLeaseBinding): AxisTaskFileFingerprintPort {
      const port = factory.openTaskPort(binding)
      return Object.freeze({
        captureAll: async (request: Parameters<AxisTaskFileFingerprintPort['captureAll']>[0]) => {
          events.push('fingerprint-capture')
          return port.captureAll(request)
        },
        verifyAll: async (request: Parameters<AxisTaskFileFingerprintPort['verifyAll']>[0]) => {
          events.push('fingerprint-verify')
          return port.verifyAll(request)
        },
      })
    },
  }
}

function tracedWriter(
  writer: AxisFileWritePort | undefined,
  events?: string[],
): AxisFileWritePort | undefined {
  if (!events) return writer
  const delegate = writer ?? { write: writeTextFile }
  return {
    async write(projectRoot, filePath, content) {
      events.push('write')
      await delegate.write(projectRoot, filePath, content)
    },
  }
}

function allowPermission(): AxisToolPermissionPort {
  return { request: vi.fn(async () => ({ behavior: 'allow' as const, reason: 'response' as const })) }
}

function gatePort(status: 'passed' | 'failed') {
  return {
    supports: (
      _projectRoot: string,
      _sessionId: string,
      gates: Array<AxisGateBatchResult['gates'][number]['gate']>,
    ): boolean => (
      gates.every((gate) => gate === 'compile' || gate === 'test')
    ),
    run: vi.fn(async (input: {
      cycle?: number
      projectRoot: string
      runId: string
      sessionId: string
      taskId: string
      requiredGates: Array<AxisGateBatchResult['gates'][number]['gate']>
    }): Promise<AxisGateBatchResult> => ({
      cycle: input.cycle ?? 1,
      evidenceIds: status === 'passed'
        ? ['gate-evidence-1', 'gate-evidence-2']
        : ['gate-evidence-1'],
      gates: [{
        durationMs: 1,
        evidence: [status === 'passed' ? 'compile passed' : 'compile failed'],
        gate: 'compile',
        status,
        taskId: input.taskId,
      }, {
        durationMs: status === 'passed' ? 1 : 0,
        evidence: [status === 'passed' ? 'test passed' : 'test skipped'],
        gate: 'test',
        status: status === 'passed' ? 'passed' : 'skipped',
        taskId: input.taskId,
      }],
      runId: input.runId,
      schemaVersion: 1,
      sessionId: input.sessionId,
      status,
      taskId: input.taskId,
    })),
  }
}

function tracked<T extends { close(): void }>(resource: T): T {
  closables.push(resource)
  return resource
}

function tickingClock(): () => Date {
  let tick = 0
  return () => new Date(Date.parse('2026-07-26T08:00:00.000Z') + tick++ * 1_000)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
