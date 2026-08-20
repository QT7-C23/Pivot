import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxisCheckpointReceiptIssuer, type AxisCheckpointStorePort } from '../../src/main/services/axis-checkpoint-receipt-issuer'
import { AxisExecutionAuthorityService } from '../../src/main/services/axis-execution-authority'
import { projectBindingReader } from '../fixtures/axis-project-binding'
import { AxisExecutionTransactionJournal } from '../../src/main/services/axis-execution-transaction-journal'
import { AxisFakeMutatingExecutor } from '../../src/main/services/axis-fake-mutating-executor'
import { AxisGuardedFakeExecutionHarness, type AxisRollbackPort } from '../../src/main/services/axis-guarded-fake-execution'
import { AxisMainPermissionGrantCollector, type AxisToolPermissionPort } from '../../src/main/services/axis-permission-grant-collector'
import { AxisPermissionManagerPort } from '../../src/main/services/axis-permission-manager-port'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { PermissionManager } from '../../src/main/services/permission-manager'
import type { AxisCheckpointReceipt, AxisTask } from '../../src/shared/axis-engine-contracts'
import type { FileCheckpointRecord } from '../../src/shared/types/domain'

let tempRoot = ''
let existingFile = ''
let newFile = ''
const transactionJournals: AxisExecutionTransactionJournal[] = []

beforeEach(async () => {
  const requestedRoot = path.join(os.tmpdir(), `pivot-axis-guarded-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(requestedRoot, { recursive: true })
  tempRoot = await realpath(requestedRoot)
  existingFile = path.join(tempRoot, 'existing.ts')
  newFile = path.join(tempRoot, 'new.ts')
  await writeFile(existingFile, 'before')
})

afterEach(async () => {
  vi.useRealTimers()
  transactionJournals.splice(0).forEach((journal) => journal.close())
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Axis guarded fake execution', () => {
  it('derives the grant from the authoritative task and creates physical rollback receipts before simulation', async () => {
    const checkpointStore = new FileCheckpointStore()
    const permission = allowPermission()
    const rollback = successfulRollback()
    const transactions = transactionJournal()
    const harness = createHarness({ checkpointStore, permission, rollback, transactions })

    const result = await harness.execute(request())

    expect(result.status).toBe('simulated')
    expect(result.mutationReceipts).toHaveLength(2)
    expect(permission.request).toHaveBeenCalledTimes(1)
    expect(permission.request).toHaveBeenCalledWith(expect.objectContaining({
      assignedFiles: [existingFile, newFile],
      taskId: 'task-1',
      toolName: 'fs.safeWrite',
    }), undefined)
    expect(result.checkpointReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ filePath: existingFile, priorState: 'existing-file', rollbackAction: 'restore-checkpoint' }),
      { checkpointId: null, filePath: newFile, priorState: 'new-file', rollbackAction: 'delete-created-file' },
    ]))
    expect(checkpointStore.listForSession('session-1')).toHaveLength(1)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(rollback.rollback).not.toHaveBeenCalled()
    expect(transactions.listForRun('run-1')).toEqual([expect.objectContaining({ status: 'completed', revision: 3 })])
    checkpointStore.close()
  })

  it('blocks timeout-denied permission before checkpointing or worker execution', async () => {
    const checkpointStore = checkpointStoreMock()
    const signals: Array<{ payload: unknown; signal: string }> = []
    const permission = new AxisPermissionManagerPort({
      permissions: new PermissionManager({ timeoutMs: 5 }),
      sendSignal: (signal, payload) => signals.push({ payload, signal }),
    })
    const worker = { execute: vi.fn() }
    const transactions = transactionJournal()
    const harness = createHarness({ checkpointStore, permission, transactions, worker })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ status: 'blocked', blockReason: 'permission-timeout' })
    expect(signals).toContainEqual(expect.objectContaining({
      payload: expect.objectContaining({
        input: { assignedFiles: [existingFile, newFile], taskId: 'task-1' },
        toolName: 'fs.safeWrite',
      }),
      signal: 'permission:request',
    }))
    expect(signals).toContainEqual(expect.objectContaining({
      payload: expect.objectContaining({ behavior: 'deny', reason: 'timeout' }),
      signal: 'permission:resolved',
    }))
    expect(checkpointStore.create).not.toHaveBeenCalled()
    expect(worker.execute).not.toHaveBeenCalled()
    expect(transactions.listForRun('run-1')).toEqual([])
  })

  it('blocks an aborted request before permission, checkpoint, or worker work begins', async () => {
    const controller = new AbortController()
    controller.abort()
    const checkpointStore = checkpointStoreMock()
    const permission = allowPermission()
    const worker = { execute: vi.fn() }
    const harness = createHarness({ checkpointStore, permission, worker })

    const result = await harness.execute({ ...request(), signal: controller.signal })

    expect(result).toMatchObject({ status: 'blocked', blockReason: 'aborted' })
    expect(permission.request).not.toHaveBeenCalled()
    expect(checkpointStore.create).not.toHaveBeenCalled()
    expect(worker.execute).not.toHaveBeenCalled()
  })

  it('does not call the worker when one physical checkpoint cannot be created', async () => {
    await writeFile(newFile, 'also-before')
    const checkpointStore = checkpointStoreMock()
    vi.mocked(checkpointStore.create)
      .mockResolvedValueOnce(checkpointRecord(existingFile, 'checkpoint-1'))
      .mockRejectedValueOnce(new Error('checkpoint storage unavailable'))
    const worker = { execute: vi.fn() }
    const harness = createHarness({ checkpointStore, permission: allowPermission(), worker })

    const result = await harness.execute(request())

    expect(result).toMatchObject({ status: 'blocked', blockReason: 'checkpoint-failed' })
    expect(checkpointStore.create).toHaveBeenCalledTimes(2)
    expect(worker.execute).not.toHaveBeenCalled()
  })

  it('reports a complete rollback after a worker failure', async () => {
    const checkpointStore = new FileCheckpointStore()
    const rollback = successfulRollback()
    const worker = { execute: vi.fn(async () => { throw new Error('fake worker failed') }) }
    const transactions = transactionJournal()
    const harness = createHarness({ checkpointStore, permission: allowPermission(), rollback, transactions, worker })

    const result = await harness.execute(request())

    expect(result.status).toBe('failed-rolled-back')
    expect(result.rollbackOutcomes).toHaveLength(2)
    expect(result.rollbackOutcomes.every((outcome) => outcome.status === 'completed')).toBe(true)
    expect(rollback.rollback).toHaveBeenCalledWith(expect.objectContaining({
      receipts: expect.arrayContaining([
        expect.objectContaining({ filePath: existingFile }),
        expect.objectContaining({ filePath: newFile }),
      ]),
    }))
    expect(transactions.listForRun('run-1')).toEqual([expect.objectContaining({ status: 'rolled-back', revision: 5 })])
    checkpointStore.close()
  })

  it('surfaces incomplete rollback evidence instead of claiming recovery', async () => {
    const checkpointStore = new FileCheckpointStore()
    const rollback: AxisRollbackPort = {
      rollback: vi.fn(async ({ receipts }: Parameters<AxisRollbackPort['rollback']>[0]) => receipts.map((receipt, index) => ({
        action: receipt.rollbackAction,
        detail: index === 0 ? 'restored' : 'delete failed',
        filePath: receipt.filePath,
        status: index === 0 ? 'completed' as const : 'failed' as const,
      }))),
    }
    const worker = { execute: vi.fn(async () => { throw new Error('fake worker failed') }) }
    const transactions = transactionJournal()
    const harness = createHarness({ checkpointStore, permission: allowPermission(), rollback, transactions, worker })

    const result = await harness.execute(request())

    expect(result.status).toBe('failed-rollback-incomplete')
    expect(result.rollbackOutcomes.some((outcome) => outcome.status === 'failed')).toBe(true)
    expect(transactions.listForRun('run-1')).toEqual([expect.objectContaining({ status: 'rollback-incomplete', revision: 5 })])
    checkpointStore.close()
  })
})

function createHarness(options: {
  checkpointStore: AxisCheckpointStorePort
  permission: AxisToolPermissionPort
  rollback?: AxisRollbackPort
  transactions?: AxisExecutionTransactionJournal
  worker?: { execute: AxisFakeMutatingExecutor['execute'] }
}) {
  const authority = new AxisExecutionAuthorityService({
    clock: fixedClock,
    projectBindings: projectBindingReader(tempRoot),
    secret: 'a'.repeat(32),
  })
  return new AxisGuardedFakeExecutionHarness({
    authority,
    checkpointIssuer: new AxisCheckpointReceiptIssuer({ checkpoints: options.checkpointStore, clock: fixedClock }),
    grantCollector: new AxisMainPermissionGrantCollector({
      clock: fixedClock,
      permissions: options.permission,
      projectRootForSession: (sessionId) => sessionId === 'session-1' ? tempRoot : null,
    }),
    rollback: options.rollback ?? successfulRollback(),
    transactions: options.transactions ?? transactionJournal(),
    worker: options.worker ?? new AxisFakeMutatingExecutor({ authority, clock: fixedClock }),
  })
}

function transactionJournal(): AxisExecutionTransactionJournal {
  const journal = new AxisExecutionTransactionJournal(':memory:', { clock: fixedClock })
  transactionJournals.push(journal)
  return journal
}

function request() {
  return {
    contentDigests: [
      { filePath: existingFile, sha256: sha256('after-existing') },
      { filePath: newFile, sha256: sha256('after-new') },
    ],
    projectRoot: tempRoot,
    runId: 'run-1',
    sessionId: 'session-1',
    task: task(),
  }
}

function task(): AxisTask {
  return {
    assignedFiles: [existingFile, newFile],
    dependencies: [],
    estimatedComplexity: 2,
    id: 'task-1',
    objective: 'Safely simulate two file writes',
    requiredTools: ['fs.safeWrite'],
    requiredGates: ['compile', 'test'],
    requiresHumanReview: false,
    spawnDepth: 1,
    title: 'Safe simulation',
  }
}

function allowPermission(): AxisToolPermissionPort {
  return { request: vi.fn(async () => ({ behavior: 'allow' as const, reason: 'response' as const })) }
}

function successfulRollback(): AxisRollbackPort {
  return {
    rollback: vi.fn(async ({ receipts }: Parameters<AxisRollbackPort['rollback']>[0]) => receipts.map((receipt) => ({
      action: receipt.rollbackAction,
      detail: 'rollback simulated',
      filePath: receipt.filePath,
      status: 'completed' as const,
    }))),
  }
}

function checkpointStoreMock(): AxisCheckpointStorePort {
  return { create: vi.fn(async (_sessionId, _projectRoot, filePath) => checkpointRecord(filePath, 'checkpoint-1')) }
}

function checkpointRecord(filePath: string, id: string): FileCheckpointRecord {
  return {
    content: 'before', createdAt: fixedClock().toISOString(), filePath, id,
    sessionId: 'session-1', sha256: sha256('before'), sizeBytes: 6,
  }
}

function fixedClock(): Date {
  return new Date('2026-07-22T04:00:00.000Z')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
