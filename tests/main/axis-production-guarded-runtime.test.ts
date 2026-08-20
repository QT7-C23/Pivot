import {
  createHash,
} from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AxisAuthorityAuditRegistry } from '../../src/main/services/axis-authority-audit-registry'
import { AxisExecutionTransactionJournal } from '../../src/main/services/axis-execution-transaction-journal'
import { AxisExternalFileFingerprintAdapter } from '../../src/main/services/axis-external-file-fingerprint-adapter'
import type { AxisProjectFileIdentityPort } from '../../src/main/services/axis-file-lease-ports'
import type { AxisGuardedSafeWriteExecutionRequest } from '../../src/main/services/axis-guarded-safe-write-ports'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { AxisTrustedGateProfileAdapter } from '../../src/main/services/axis-trusted-gate-profile-adapter'
import {
  createAxisProductionGuardedRuntime,
  resolveAxisRealExecutionFeature,
} from '../../src/main/services/axis-production-guarded-runtime'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { SqliteAxisBlackboardStore } from '../../src/main/services/sqlite-axis-blackboard-store'
import { SqliteAxisFileLeaseStore } from '../../src/main/services/sqlite-axis-file-lease-store'
import { SqliteAxisProjectBindingStore } from '../../src/main/services/sqlite-axis-project-binding-store'
import { AxisSemanticReviewEvidenceRegistry } from '../../src/main/services/axis-semantic-review-evidence-registry'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Axis production guarded runtime', () => {
  it('is disabled by default, accepts only an explicit binary feature value, and constructs nothing when disabled', () => {
    expect(resolveAxisRealExecutionFeature({}).isRealExecutionEnabled()).toBe(false)
    expect(resolveAxisRealExecutionFeature({ PIVOT_AXIS_REAL_EXECUTION: '0' }).isRealExecutionEnabled()).toBe(false)
    expect(resolveAxisRealExecutionFeature({ PIVOT_AXIS_REAL_EXECUTION: '1' }).isRealExecutionEnabled()).toBe(true)
    expect(() => resolveAxisRealExecutionFeature({
      PIVOT_AXIS_REAL_EXECUTION: 'true',
    })).toThrow(/0 or 1/i)

    expect(createAxisProductionGuardedRuntime({
      authorityAudit: unavailable(),
      checkpoints: unavailable(),
      commandRunner: unavailable(),
      databasePath: path.join(createTempDirectory('pivot-axis-disabled-'), 'pivot.db'),
      feature: resolveAxisRealExecutionFeature({}),
      fileLeases: unavailable(),
      gateProfiles: unavailable(),
      identity: unavailable(),
      permissions: unavailable(),
      projectBindings: unavailable(),
    })).toBeNull()
  })

  it('constructs the reviewed production runtime and persists Blackboard precommit evidence', async () => {
    const fixture = await createFixture()
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      feature: resolveAxisRealExecutionFeature({
        PIVOT_AXIS_REAL_EXECUTION: '1',
      }),
      secrets: {
        authority: Buffer.alloc(32, 7),
        fingerprint: Buffer.alloc(32, 9),
      },
    })
    expect(runtime).not.toBeNull()
    await runtime!.ready

    const result = await runtime!.openExecutionPort().execute(
      await executionRequest(fixture),
    )

    expect(result.status).toBe('completed')
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
    expect(statSync(fixture.filePath).isFile()).toBe(true)
    runtime!.close()

    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(journal.listForRun('run-1')).toMatchObject([{
      revision: result.completionEvidence?.transactionRevision,
      status: 'completed',
      transactionId: result.completionEvidence?.transactionId,
      updatedAt: result.completionEvidence?.completedAt,
    }])
    journal.close()
    const blackboards = new SqliteAxisBlackboardStore(fixture.databasePath)
    expect(blackboards.getFull({
      runId: 'run-1',
      sessionId: 'session-1',
    })?.evidence).toMatchObject([{
      evidenceType: 'axis.safe-write.precommit',
      source: 'runtime',
      visibility: 'run',
    }])
    blackboards.close()
    fixture.close()
  })

  it('runs configured independent semantic review and persists durable evidence before completion', async () => {
    const fixture = await createFixture()
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      feature: resolveAxisRealExecutionFeature({ PIVOT_AXIS_REAL_EXECUTION: '1' }),
      semanticReview: {
        correctness: {
          identity: { independentFromWorker: true, modelId: 'correctness-reviewer', providerId: 'provider-review', readOnlyTools: true },
          async review(request) {
            expect(request.diff).toContain('after')
            return { confidence: 0.9, findings: [], kind: request.kind, requestId: request.requestId, schemaVersion: 1, summary: 'correct', verdict: 'passed' }
          },
        },
      },
    })!

    const result = await runtime.execute(await executionRequest(fixture))

    expect(result.status).toBe('completed')
    expect(runtime.openSemanticReviewTelemetryReaderPort()?.list({ limit: 10, sessionId: 'session-1' }))
      .toMatchObject({ available: true, items: [{ runId: 'run-1', status: 'passed', usage: null }] })
    runtime.close()
    const evidence = new AxisSemanticReviewEvidenceRegistry(fixture.databasePath)
    expect(evidence.listForRun('run-1')).toMatchObject([{
      decision: { status: 'passed' },
      kind: 'correctness',
      reviewer: { independentFromWorker: true, readOnlyTools: true },
    }])
    evidence.close()
    fixture.close()
  })

  it('physically rolls back production writes when semantic review fails closed', async () => {
    const fixture = await createFixture()
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      feature: resolveAxisRealExecutionFeature({ PIVOT_AXIS_REAL_EXECUTION: '1' }),
      semanticReview: {
        correctness: {
          identity: { independentFromWorker: true, modelId: 'correctness-reviewer', providerId: 'provider-review', readOnlyTools: true },
          async review(request) {
            return {
              confidence: 0.9,
              findings: [{ category: 'correctness', cvss: null, filePath: fixture.filePath, line: 1, message: 'wrong behavior', recommendation: 'fix behavior', severity: 'high' }],
              kind: request.kind, requestId: request.requestId, schemaVersion: 1, summary: 'incorrect', verdict: 'failed',
            }
          },
        },
      },
    })!

    const result = await runtime.execute(await executionRequest(fixture))

    expect(result).toMatchObject({ status: 'failed-rolled-back' })
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')
    runtime.close()
    fixture.close()
  })

  it.each([
    { blockReason: 'permission-denied', reason: 'response' as const },
    { blockReason: 'permission-timeout', reason: 'timeout' as const },
  ])('blocks a real $blockReason outcome before checkpoint, transaction, Gate, or write', async ({
    blockReason,
    reason,
  }) => {
    const fixture = await createFixture()
    const gateCalls: string[] = []
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      commandRunner: {
        async run(request) {
          gateCalls.push(request.command)
          throw new Error('Gate must not run after denied permission')
        },
      },
      feature: resolveAxisRealExecutionFeature({
        PIVOT_AXIS_REAL_EXECUTION: '1',
      }),
      permissions: {
        async request() {
          return { behavior: 'deny' as const, reason }
        },
      },
    })!

    const result = await runtime.openExecutionPort().execute(
      await executionRequest(fixture),
    )

    expect(result).toMatchObject({
      blockReason,
      checkpointReceipts: [],
      gateResult: null,
      status: 'blocked',
      writeReceipts: [],
    })
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')
    expect(gateCalls).toEqual([])
    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(journal.listForRun('run-1')).toEqual([])
    journal.close()
    await expect(
      fixture.dependencies.fileLeases.listActive(fixture.projectId),
    ).resolves.toEqual([])

    runtime.close()
    fixture.close()
  })

  it('rolls back a real write and releases its lease when the compile Gate fails', async () => {
    const fixture = await createFixture()
    let gateCall = 0
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      commandRunner: {
        async run(request) {
          gateCall += 1
          return {
            ...request,
            exitCode: gateCall === 1 ? 1 : 0,
            finishedAt: '2026-07-29T00:00:01.000Z',
            outputTruncated: false,
            startedAt: '2026-07-29T00:00:00.000Z',
            stderr: gateCall === 1 ? 'compile failed' : '',
            stdout: '',
            timedOut: false,
          }
        },
      },
      feature: resolveAxisRealExecutionFeature({
        PIVOT_AXIS_REAL_EXECUTION: '1',
      }),
    })!

    const result = await runtime.openExecutionPort().execute(
      await executionRequest(fixture),
    )

    expect(result).toMatchObject({
      blockReason: null,
      gateResult: { status: 'failed' },
      status: 'failed-rolled-back',
    })
    expect(result.gateResult?.gates[0]).toMatchObject({
      gate: 'compile',
      status: 'failed',
    })
    expect(result.rollbackOutcomes).toHaveLength(1)
    expect(result.rollbackOutcomes[0]).toMatchObject({
      action: 'restore-checkpoint',
      status: 'completed',
    })
    expect(path.basename(result.rollbackOutcomes[0]!.filePath)).toBe('one.ts')
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')
    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(journal.listForRun('run-1')).toMatchObject([{
      status: 'rolled-back',
    }])
    journal.close()
    await expect(
      fixture.dependencies.fileLeases.listActive(fixture.projectId),
    ).resolves.toEqual([])

    runtime.close()
    fixture.close()
  })

  it('executes correctness and security from the trusted project profile before durable completion', async () => {
    const fixture = await createFixture()
    const gateCalls: string[] = []
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      commandRunner: {
        async run(request) {
          gateCalls.push(request.args.at(-1) ?? request.command)
          return passedCommand(request)
        },
      },
      feature: resolveAxisRealExecutionFeature({ PIVOT_AXIS_REAL_EXECUTION: '1' }),
    })!

    const result = await runtime.openExecutionPort().execute(
      await executionRequest(fixture, {
        requiredGates: ['compile', 'test', 'correctness', 'security'],
      }),
    )

    expect(result.status).toBe('completed')
    expect(result.gateResult?.gates.map(({ gate, status }) => [gate, status])).toEqual([
      ['compile', 'passed'],
      ['test', 'passed'],
      ['correctness', 'passed'],
      ['security', 'passed'],
    ])
    expect(gateCalls).toEqual(['compile', 'test', 'correctness', 'security'])
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('after')

    runtime.close()
    fixture.close()
  })

  it('rolls back a real write and persists evidence when the trusted security Gate fails', async () => {
    const fixture = await createFixture()
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      commandRunner: {
        async run(request) {
          return request.args.at(-1) === 'security'
            ? { ...passedCommand(request), exitCode: 2, stderr: 'security review failed' }
            : passedCommand(request)
        },
      },
      feature: resolveAxisRealExecutionFeature({ PIVOT_AXIS_REAL_EXECUTION: '1' }),
    })!

    const result = await runtime.openExecutionPort().execute(
      await executionRequest(fixture, {
        requiredGates: ['compile', 'test', 'correctness', 'security'],
      }),
    )

    expect(result).toMatchObject({
      gateResult: { status: 'failed' },
      status: 'failed-rolled-back',
    })
    expect(result.gateResult?.gates.at(-1)).toMatchObject({ gate: 'security', status: 'failed' })
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')

    runtime.close()
    fixture.close()
  })

  it('recovers a durable worker-started transaction before runtime readiness', async () => {
    const fixture = await createFixture()
    const createdFile = path.join(fixture.projectRoot, 'src', 'created.ts')
    writeFileSync(createdFile, 'interrupted write')
    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    const prepared = journal.create({
      projectRoot: fixture.projectRoot,
      receipts: [{
        checkpointId: null,
        filePath: createdFile,
        priorState: 'new-file',
        rollbackAction: 'delete-created-file',
      }],
      runId: 'run-recovery',
      sessionId: 'session-1',
      taskId: 'task-recovery',
    })
    journal.markWorkerStarted({
      expectedRevision: prepared.revision,
      transactionId: prepared.transactionId,
    })
    journal.close()

    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      feature: resolveAxisRealExecutionFeature({
        PIVOT_AXIS_REAL_EXECUTION: '1',
      }),
    })!
    await runtime.ready
    const readyJournal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(readyJournal.listForRun('run-recovery')).toMatchObject([{
      status: 'rolled-back',
    }])
    readyJournal.close()
    expect(() => statSync(createdFile)).toThrow()
    runtime.close()

    const recoveredJournal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(recoveredJournal.listForRun('run-recovery')).toMatchObject([{
      status: 'rolled-back',
    }])
    recoveredJournal.close()
    fixture.close()
  })

  it.each([
    {
      change: 'modified',
      mutate(filePath: string) {
        writeFileSync(filePath, 'external modification')
      },
      prepare: () => undefined,
      verify(filePath: string) {
        expect(readFileSync(filePath, 'utf8')).toBe('external modification')
      },
    },
    {
      change: 'deleted',
      mutate(filePath: string) {
        unlinkSync(filePath)
      },
      prepare: () => undefined,
      verify(filePath: string) {
        expect(existsSync(filePath)).toBe(false)
      },
    },
    {
      change: 'created',
      mutate(filePath: string) {
        writeFileSync(filePath, 'external creation')
      },
      prepare(filePath: string) {
        unlinkSync(filePath)
      },
      verify(filePath: string) {
        expect(readFileSync(filePath, 'utf8')).toBe('external creation')
      },
    },
    {
      change: 'replaced',
      mutate(filePath: string) {
        renameSync(filePath, `${filePath}.external-backup`)
        writeFileSync(filePath, 'before')
      },
      prepare: () => undefined,
      verify(filePath: string) {
        expect(readFileSync(filePath, 'utf8')).toBe('before')
        expect(readFileSync(`${filePath}.external-backup`, 'utf8')).toBe('before')
      },
    },
  ])('blocks a real externally $change file before Worker execution', async ({
    mutate,
    prepare,
    verify,
  }) => {
    const fixture = await createFixture()
    prepare(fixture.filePath)
    let identityResolutions = 0
    const identity: AxisProjectFileIdentityPort = {
      async resolve(binding, filePath) {
        identityResolutions += 1
        if (identityResolutions === 3) mutate(fixture.filePath)
        return fixture.baseIdentity.resolve(binding, filePath)
      },
    }
    const fileLeases = new SqliteAxisFileLeaseStore(identity, fixture.databasePath)
    const gateCalls: string[] = []
    const runtime = createAxisProductionGuardedRuntime({
      ...fixture.dependencies,
      commandRunner: {
        async run(command) {
          gateCalls.push(command.command)
          throw new Error('Gate must not run after rejected fingerprint evidence')
        },
      },
      feature: resolveAxisRealExecutionFeature({
        PIVOT_AXIS_REAL_EXECUTION: '1',
      }),
      fileLeases,
      identity,
      secrets: {
        authority: Buffer.alloc(32, 11),
        fingerprint: Buffer.alloc(32, 13),
      },
    })!

    const result = await runtime.openExecutionPort().execute(
      await executionRequest(fixture, {
        content: 'worker content',
        runId: 'run-external',
        taskId: 'task-external',
      }),
    )

    expect(result).toMatchObject({
      blockReason: 'external-change',
      gateResult: null,
      status: 'blocked',
      writeReceipts: [],
    })
    expect(gateCalls).toEqual([])
    verify(fixture.filePath)
    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(journal.listForRun(result.runId)).toEqual([])
    journal.close()
    await expect(fileLeases.listActive(fixture.projectId)).resolves.toEqual([])

    runtime.close()
    fileLeases.close()
    fixture.close()
  })
})

async function createFixture() {
  const root = createTempDirectory('pivot-axis-production-runtime-')
  const projectRoot = path.join(root, 'project')
  const databasePath = path.join(root, 'pivot.db')
  const filePath = path.join(projectRoot, 'src', 'one.ts')
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, 'before')
  const projectBindings = new SqliteAxisProjectBindingStore(databasePath)
  const binding = await projectBindings.bind({
    projectRoot,
    sessionId: 'session-1',
  })
  const identity = new AxisMainProjectFileIdentityAdapter({
    projectBindings: projectBindings.openReaderPort(),
  })
  const fileLeases = new SqliteAxisFileLeaseStore(identity, databasePath)
  const checkpoints = new FileCheckpointStore(databasePath)
  const authorityAudit = new AxisAuthorityAuditRegistry(databasePath)
  return {
    close() {
      authorityAudit.close()
      checkpoints.close()
      fileLeases.close()
      projectBindings.close()
    },
    databasePath,
    dependencies: {
      authorityAudit,
      checkpoints,
      commandRunner: {
        async run(request: {
          args: string[]
          command: string
          cwd: string
          timeoutMs: number
        }) {
          return {
            ...request,
            exitCode: 0,
            finishedAt: '2026-07-29T00:00:01.000Z',
            outputTruncated: false,
            startedAt: '2026-07-29T00:00:00.000Z',
            stderr: '',
            stdout: 'passed',
            timedOut: false,
          }
        },
      },
      databasePath,
      fileLeases,
      gateProfiles: new AxisTrustedGateProfileAdapter({
        profile: {
          commands: ['compile', 'test', 'correctness', 'security'].map((gate) => ({
            args: ['gate', gate],
            command: 'node',
            gate: gate as 'compile' | 'test' | 'correctness' | 'security',
            timeoutMs: 5_000,
          })),
          profileId: 'production-test',
          schemaVersion: 1,
        },
        projects: projectBindings.openReaderPort(),
      }),
      identity,
      permissions: {
        async request() {
          return { behavior: 'allow' as const, reason: 'response' as const }
        },
      },
      projectBindings: projectBindings.openReaderPort(),
    },
    baseIdentity: identity,
    filePath,
    projectId: binding.projectId,
    projectRoot: binding.projectRoot,
  }
}

async function executionRequest(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  options: {
    content?: string
    runId?: string
    taskId?: string
    requiredGates?: Array<'compile' | 'test' | 'correctness' | 'security'>
  } = {},
): Promise<AxisGuardedSafeWriteExecutionRequest> {
  const content = options.content ?? 'after'
  const runId = options.runId ?? 'run-1'
  const taskId = options.taskId ?? 'task-1'
  const fingerprints = new AxisExternalFileFingerprintAdapter({
    identity: fixture.baseIdentity,
    projectBindings: fixture.dependencies.projectBindings,
    proofSecret: Buffer.alloc(32, 17),
  })
  const evidence = await fingerprints.openTaskPort({
    projectId: fixture.projectId,
    runId,
    sessionId: 'session-1',
    taskId,
  }).captureAll({
    filePaths: [fixture.filePath],
  })
  return {
    projectRoot: fixture.projectRoot,
    reviewedProposal: {
      expectedRevision: 1,
      expiresAt: evidence[0]!.expiresAt,
      files: evidence.map((item) => ({
        fileKey: item.fileKey,
        filePath: fixture.filePath,
        projectRelativePath: item.projectRelativePath,
        proposedContentSha256: createHash('sha256')
          .update(content, 'utf8')
          .digest('hex'),
        state: item.state,
      })),
      projectId: fixture.projectId,
      proposalId: `proposal-${runId}`,
      receiptId: `receipt-${runId}`,
      runId,
      sessionId: 'session-1',
      taskId,
      verified: true,
    },
    runId,
    sessionId: 'session-1',
    task: {
      assignedFiles: [fixture.filePath],
      dependencies: [],
      estimatedComplexity: 1,
      id: taskId,
      objective: 'Safely update one file',
      requiredTools: ['fs.safeWrite'],
      requiredGates: options.requiredGates ?? ['compile', 'test'],
      requiresHumanReview: false,
      spawnDepth: 1,
      title: 'Safe write',
    },
    writes: [{ content, filePath: fixture.filePath }],
  }
}

function passedCommand(request: {
  args: string[]
  command: string
  cwd: string
  timeoutMs: number
}) {
  return {
    ...request,
    exitCode: 0,
    finishedAt: '2026-07-29T00:00:01.000Z',
    outputTruncated: false,
    startedAt: '2026-07-29T00:00:00.000Z',
    stderr: '',
    stdout: 'passed',
    timedOut: false,
  }
}

function unavailable(): never {
  return new Proxy({}, {
    get() {
      throw new Error('disabled runtime dependency was accessed')
    },
  }) as never
}

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
