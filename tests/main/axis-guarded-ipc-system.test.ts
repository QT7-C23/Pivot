import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPCContract } from '../../src/shared/types/ipc'
import { AxisExecutionTransactionJournal } from '../../src/main/services/axis-execution-transaction-journal'
import type { IpcRuntimeResources } from '../../src/main/ipc-handlers'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisShadowRunRegistry } from '../../src/main/services/axis-shadow-run-registry'
import { SessionRegistry } from '../../src/main/services/session-registry'
import type { AxisShadowRunResult } from '../../src/shared/axis-engine-contracts'
import { axisBudget } from '../fixtures/axis-shadow-run'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
  permissionDecision: null as 'allow' | 'deny' | null,
  sent: [] as Array<{ payload: unknown; signal: string }>,
  trustedUrl: 'https://pivot.test/index.html',
}))

const ai = vi.hoisted(() => ({
  generateText: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: () => null,
    getAllWindows: () => [{
      webContents: {
        send(signal: string, payload: unknown) {
          electron.sent.push({ payload, signal })
          if (
            signal === 'permission:request'
            && electron.permissionDecision
            && payload
            && typeof payload === 'object'
            && 'requestId' in payload
          ) {
            const decision = electron.permissionDecision
            const requestId = String(payload.requestId)
            queueMicrotask(() => {
              void invoke('chat:permission', {
                behavior: decision,
                requestId,
              })
            })
          }
        },
      },
    }],
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
  ipcMain: {
    handle(channel: string, handler: (event: unknown, request: unknown) => unknown) {
      electron.handlers.set(channel, handler)
    },
  },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    isEncryptionAvailable: () => true,
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
    showItemInFolder: vi.fn(),
  },
}))

vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('ai')>(),
  generateText: ai.generateText,
}))

import { registerIpcHandlers } from '../../src/main/ipc-handlers'

let fixture: Awaited<ReturnType<typeof createFixture>> | null = null
let originalFeature: string | undefined

beforeEach(() => {
  electron.handlers.clear()
  electron.permissionDecision = null
  electron.sent.length = 0
  ai.generateText.mockReset()
  ai.generateText.mockImplementation(async () => {
    if (!fixture) throw new Error('Guarded IPC fixture is unavailable')
    return {
      output: {
        writes: [{ content: 'after', filePath: fixture.filePath }],
      },
      usage: { inputTokens: 20, outputTokens: 5 },
    }
  })
  originalFeature = process.env['PIVOT_AXIS_REAL_EXECUTION']
  process.env['PIVOT_AXIS_REAL_EXECUTION'] = '1'
})

afterEach(async () => {
  await fixture?.close()
  fixture = null
  if (originalFeature === undefined) {
    delete process.env['PIVOT_AXIS_REAL_EXECUTION']
  } else {
    process.env['PIVOT_AXIS_REAL_EXECUTION'] = originalFeature
  }
})

describe('Axis guarded safe-write Main IPC system boundary', () => {
  it('revokes session fork after soft deletion until explicit undo', async () => {
    process.env['PIVOT_AXIS_REAL_EXECUTION'] = '0'
    fixture = await createFixture()

    await invoke('session:soft-delete', { id: fixture.sessionId })
    await expect(invoke('session:get', { id: fixture.sessionId })).resolves.toBeNull()
    await expect(invoke('session:fork', { id: fixture.sessionId })).rejects.toThrow(/active|deleted/i)
    await expect(invoke('fs:tree', { sessionId: fixture.sessionId })).rejects.toThrow(/session project root/i)
    await invoke('session:undo-delete', { id: fixture.sessionId })
    await expect(invoke('fs:tree', { sessionId: fixture.sessionId })).resolves.toEqual(expect.any(Array))
    await expect(invoke('session:fork', { id: fixture.sessionId })).resolves.toMatchObject({
      projectPath: fixture.projectRoot,
    })
  })

  it('returns an explicit telemetry availability state and rejects untrusted readers', async () => {
    process.env['PIVOT_AXIS_REAL_EXECUTION'] = '0'
    fixture = await createFixture()
    await expect(invoke('axis:list-semantic-review-telemetry', { limit: 50, sessionId: fixture.sessionId }))
      .resolves.toMatchObject({ available: false, unavailableReason: 'disabled' })
    await expect(invoke('axis:list-semantic-review-telemetry', { limit: 50, sessionId: fixture.sessionId }, false))
      .rejects.toThrow(/untrusted renderer/i)
    await expect(invoke('axis:list-semantic-review-telemetry', { limit: 50, sessionId: 'forged-session' }))
      .rejects.toThrow(/session/i)
  })
  it('exposes only strict read-only guarded execution availability', async () => {
    process.env['PIVOT_AXIS_REAL_EXECUTION'] = '0'
    fixture = await createFixture()

    await expect(invoke(
      'axis:guarded-safe-write-state',
      {},
    )).resolves.toEqual({
      enabled: false,
      reason: 'disabled',
    })
    await expect(invoke(
      'axis:guarded-safe-write-state',
      { projectRoot: fixture.projectRoot } as never,
    )).rejects.toThrow(/invalid IPC request/i)
  })

  it('rejects untrusted frames and forged authority fields before changing Run state', async () => {
    fixture = await createFixture()
    const reviewedRequest = await request(fixture)

    await expect(invoke('axis:execute-guarded-safe-write', reviewedRequest, false))
      .rejects.toThrow(/untrusted renderer/i)
    await expect(invoke('axis:execute-guarded-safe-write', {
      ...reviewedRequest,
      projectRoot: fixture.projectRoot,
    } as never)).rejects.toThrow(/invalid IPC request/i)

    await expect(runState(fixture)).resolves.toMatchObject({
      revision: 2,
      status: 'planned',
    })
  })

  it('projects a durable Main completion receipt after a real successful registered IPC write', async () => {
    electron.permissionDecision = 'allow'
    fixture = await createFixture()

    const result = await invoke(
      'axis:execute-guarded-safe-write',
      await request(fixture),
    )

    expect(result).toMatchObject({
      execution: {
        blockReason: null,
        completionEvidence: {
          authority: 'pivot-main',
          gateEvidenceIds: expect.arrayContaining([
            expect.stringMatching(/^axis-gate-evidence-/),
          ]),
          runId: 'run-1',
          sessionId: fixture.sessionId,
          status: 'completed',
          taskId: 'write',
          transactionRevision: 3,
          writes: expect.arrayContaining([expect.objectContaining({
            contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          })]),
        },
        status: 'completed',
      },
      runState: {
        status: 'completed',
        tasks: [{ status: 'completed' }],
      },
    })
    expect(result.execution.completionEvidence?.writes).toEqual(
      result.execution.writeReceipts.map(({ contentSha256, envelopeId, filePath }) => ({
        contentSha256,
        envelopeId,
        filePath,
      })),
    )
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('after')
    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    const [transaction] = journal.listForRun('run-1')
    expect(transaction).toMatchObject({
      revision: 3,
      status: 'completed',
      transactionId: result.execution.completionEvidence?.transactionId,
      updatedAt: result.execution.completionEvidence?.completedAt,
    })
    journal.close()
  })

  it('projects a real Renderer permission denial through IPC into durable failed state', async () => {
    electron.permissionDecision = 'deny'
    fixture = await createFixture()

    await expect(invoke(
      'axis:execute-guarded-safe-write',
      await request(fixture),
    )).resolves.toMatchObject({
      execution: {
        blockReason: 'permission-denied',
        status: 'blocked',
      },
      runState: {
        status: 'failed',
        tasks: [{ error: expect.stringMatching(/permission/i), status: 'failed' }],
      },
    })
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')
    expect(electron.sent).toContainEqual(expect.objectContaining({
      signal: 'permission:request',
    }))
  })

  it('projects a real permission timeout through IPC without checkpointing or writing', async () => {
    fixture = await createFixture({ permissionTimeoutMs: 5 })

    await expect(invoke(
      'axis:execute-guarded-safe-write',
      await request(fixture),
    )).resolves.toMatchObject({
      execution: {
        blockReason: 'permission-timeout',
        checkpointReceipts: [],
        status: 'blocked',
        writeReceipts: [],
      },
      runState: { status: 'failed' },
    })
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')
  })

  it('physically rolls back a real write after an injected Main Gate failure', async () => {
    electron.permissionDecision = 'allow'
    fixture = await createFixture({
      gateExitCode: 1,
    })

    await expect(invoke(
      'axis:execute-guarded-safe-write',
      await request(fixture),
    )).resolves.toMatchObject({
      execution: {
        gateResult: { status: 'failed' },
        rollbackOutcomes: [{ status: 'completed' }],
        status: 'failed-rolled-back',
      },
      runState: { status: 'failed' },
    })
    expect(readFileSync(fixture.filePath, 'utf8')).toBe('before')
  })

  it('waits for interrupted-transaction recovery before handling a guarded IPC request', async () => {
    electron.permissionDecision = 'deny'
    fixture = await createFixture({
      awaitRuntimeReady: false,
      withInterruptedTransaction: true,
    })

    await expect(invoke(
      'axis:execute-guarded-safe-write',
      await request(fixture),
    )).resolves.toMatchObject({
      execution: { blockReason: 'permission-denied' },
    })
    expect(existsSync(fixture.interruptedFilePath!)).toBe(false)
    const journal = new AxisExecutionTransactionJournal(fixture.databasePath)
    expect(journal.listForRun('run-recovery')).toMatchObject([{
      status: 'rolled-back',
    }])
    journal.close()
  })

  it('surfaces cleanup failure through IPC while preserving the durable failed state', async () => {
    electron.permissionDecision = 'deny'
    fixture = await createFixture({ failRunCleanup: true })

    await expect(invoke(
      'axis:execute-guarded-safe-write',
      await request(fixture),
    )).rejects.toThrow('injected run cleanup failure')
    await expect(runState(fixture)).resolves.toMatchObject({
      status: 'failed',
      tasks: [{ status: 'failed' }],
    })
  })
})

async function createFixture(options: {
  awaitRuntimeReady?: boolean
  failRunCleanup?: boolean
  gateExitCode?: number
  permissionTimeoutMs?: number
  withInterruptedTransaction?: boolean
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-axis-ipc-system-'))
  const projectRoot = path.join(root, 'project')
  const filePath = path.join(projectRoot, 'src', 'one.ts')
  const databasePath = path.join(root, 'pivot.db')
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, 'before')

  const sessions = new SessionRegistry(databasePath)
  const session = sessions.create(projectRoot, 'Guarded IPC system test')
  sessions.close()
  const plan = guardedPlan(session.id, filePath)
  const runs = new AxisShadowRunRegistry(databasePath)
  runs.save(plan)
  runs.close()
  const states = new AxisRunStateRegistry(databasePath)
  states.create(plan, axisBudget())
  states.close()

  const interruptedFilePath = options.withInterruptedTransaction
    ? path.join(projectRoot, 'src', 'interrupted.ts')
    : null
  if (interruptedFilePath) {
    writeFileSync(interruptedFilePath, 'interrupted')
    const journal = new AxisExecutionTransactionJournal(databasePath)
    const transaction = journal.create({
      projectRoot,
      receipts: [{
        checkpointId: null,
        filePath: interruptedFilePath,
        priorState: 'new-file',
        rollbackAction: 'delete-created-file',
      }],
      runId: 'run-recovery',
      sessionId: session.id,
      taskId: 'task-recovery',
    })
    journal.markWorkerStarted({
      expectedRevision: transaction.revision,
      transactionId: transaction.transactionId,
    })
    journal.close()
  }

  const resources = registerIpcHandlers({
    axisGuarded: {
      gateCommandRunner: {
        async run(command) {
          return {
            ...command,
            exitCode: options.gateExitCode ?? 0,
            finishedAt: '2026-07-29T00:00:01.000Z',
            outputTruncated: false,
            startedAt: '2026-07-29T00:00:00.000Z',
            stderr: options.gateExitCode ? 'injected Gate failure' : '',
            stdout: options.gateExitCode ? '' : 'passed',
            timedOut: false,
          }
        },
      },
      permissionTimeoutMs: options.permissionTimeoutMs,
      runLifecycle: options.failRunCleanup
        ? {
            cleanup() {
              throw new Error('injected run cleanup failure')
            },
          }
        : undefined,
    },
    databasePath,
    trustedRendererUrl: electron.trustedUrl,
  })
  await invoke('provider:save', {
    apiKey: 'sk-system-test',
    baseUrl: 'https://api.example.com/v1',
    id: 'provider-system-test',
    kind: 'custom',
    label: 'System test provider',
    model: 'test-model',
  })
  await invoke('provider:set-active', { id: 'provider-system-test' })
  await invoke('axis:set-shadow-enabled', { enabled: true })
  if (options.awaitRuntimeReady !== false) {
    await resources.ready
  }

  return {
    async close() {
      await resources.close()
      await resources.close()
      rmSync(root, { force: true, recursive: true })
    },
    databasePath,
    filePath,
    interruptedFilePath,
    projectRoot,
    resources,
    sessionId: session.id,
  }
}

async function request(current: NonNullable<typeof fixture>) {
  const result = await invoke('axis:propose-guarded-safe-write', {
    expectedRevision: 1,
    runId: 'run-1',
    sessionId: current.sessionId,
    taskId: 'write',
  })
  return {
    expectedRevision: result.runState.revision,
    reviewedProposalReceipt: result.receipt,
    runId: 'run-1',
    sessionId: current.sessionId,
    taskId: 'write',
    writes: result.proposal.files.map((file) => ({
      content: file.proposedContent,
      filePath: file.filePath,
    })),
  }
}

async function runState(current: NonNullable<typeof fixture>) {
  const states = await invoke(
    'axis:list-run-states',
    { sessionId: current.sessionId },
  ) as IPCContract['axis:list-run-states']['response']
  return states.find((state) => state.runId === 'run-1')
}

async function invoke<K extends keyof IPCContract>(
  channel: K,
  request: IPCContract[K]['request'],
  trusted = true,
): Promise<IPCContract[K]['response']> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`)
  const mainFrame = { url: trusted ? electron.trustedUrl : 'https://attacker.test/' }
  const sender = {
    id: 1,
    mainFrame,
    send: vi.fn(),
  }
  return await handler({
    sender,
    senderFrame: mainFrame,
  }, request) as IPCContract[K]['response']
}

function guardedPlan(sessionId: string, filePath: string): AxisShadowRunResult {
  const timestamp = '2026-07-29T00:00:00.000Z'
  return {
    complexity: {
      confidence: 1,
      policyAdjustments: [],
      reasons: ['One guarded write'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      riskFlags: [],
      route: 'single-agent',
      schemaVersion: 1,
      score: 1,
      suggestedWorkers: 1,
    },
    dag: {
      createdAt: timestamp,
      dagId: 'dag-1',
      objective: 'Guarded write',
      schemaVersion: 1,
      tasks: [{
        assignedFiles: [filePath],
        dependencies: [],
        estimatedComplexity: 1,
        id: 'write',
        objective: 'Write one file',
        requiredTools: ['fs.safeWrite'],
        requiredGates: ['compile', 'test'],
        requiresHumanReview: false,
        spawnDepth: 1,
        title: 'Write',
      }],
    },
    mode: 'shadow',
    objective: 'Guarded write',
    schedule: {
      batches: [['write']],
      orderedTaskIds: ['write'],
      warnings: [],
    },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{
        detail: 'planned',
        sequence: 1,
        taskId: null,
        timestamp,
        type: 'run-completed',
      }],
      runId: 'run-1',
      sessionId,
      startedAt: timestamp,
      traceId: 'trace-1',
    },
    usage: {
      costUsd: 0,
      durationMs: 0,
      gateCyclesForFile: 0,
      pivots: 0,
      retriesForTask: 0,
      tokens: 0,
    },
  }
}
