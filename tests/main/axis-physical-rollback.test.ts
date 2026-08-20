import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxisExecutionRecoveryCoordinator } from '../../src/main/services/axis-execution-recovery'
import { AxisExecutionTransactionJournal } from '../../src/main/services/axis-execution-transaction-journal'
import { AxisPhysicalRollbackExecutor } from '../../src/main/services/axis-physical-rollback-executor'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import type { AxisCheckpointReceipt } from '../../src/shared/axis-engine-contracts'

let tempRoot = ''
let existingFile = ''
let newFile = ''

beforeEach(async () => {
  const requestedRoot = path.join(os.tmpdir(), `pivot-axis-rollback-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(requestedRoot, { recursive: true })
  tempRoot = await realpath(requestedRoot)
  existingFile = path.join(tempRoot, 'existing.ts')
  newFile = path.join(tempRoot, 'new.ts')
  await writeFile(existingFile, 'before')
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Axis physical rollback executor', () => {
  it('restores existing files, deletes newly created files, and is idempotent', async () => {
    const checkpoints = new FileCheckpointStore()
    const checkpoint = await checkpoints.create('session-1', tempRoot, existingFile)
    const receipts = rollbackReceipts(checkpoint.id)
    const rollback = new AxisPhysicalRollbackExecutor({ checkpoints })
    await writeFile(existingFile, 'after')
    await writeFile(newFile, 'created by worker')

    const first = await rollback.rollback(rollbackRequest(receipts))
    const second = await rollback.rollback(rollbackRequest(receipts))

    expect(first.every((outcome) => outcome.status === 'completed')).toBe(true)
    expect(second.every((outcome) => outcome.status === 'completed')).toBe(true)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(second.find((outcome) => outcome.filePath === newFile)?.detail).toMatch(/already absent/i)
    checkpoints.close()
  })

  it('fails closed when checkpoint ownership does not match the transaction session', async () => {
    const checkpoints = new FileCheckpointStore()
    const checkpoint = await checkpoints.create('session-other', tempRoot, existingFile)
    await writeFile(existingFile, 'after')
    const rollback = new AxisPhysicalRollbackExecutor({ checkpoints })

    const outcomes = await rollback.rollback(rollbackRequest([{
      checkpointId: checkpoint.id,
      filePath: existingFile,
      priorState: 'existing-file',
      rollbackAction: 'restore-checkpoint',
    }]))

    expect(outcomes).toEqual([expect.objectContaining({ status: 'failed' })])
    expect(outcomes[0]!.detail).toMatch(/session ownership/i)
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('after')
    checkpoints.close()
  })

  it('rejects rollback paths outside the authoritative project root', async () => {
    const checkpoints = new FileCheckpointStore()
    const outsideFile = path.join(path.dirname(tempRoot), `${path.basename(tempRoot)}-outside.txt`)
    await writeFile(outsideFile, 'outside')
    const rollback = new AxisPhysicalRollbackExecutor({ checkpoints })

    const outcomes = await rollback.rollback(rollbackRequest([{
      checkpointId: null,
      filePath: outsideFile,
      priorState: 'new-file',
      rollbackAction: 'delete-created-file',
    }]))

    expect(outcomes[0]).toMatchObject({ status: 'failed' })
    await expect(readFile(outsideFile, 'utf8')).resolves.toBe('outside')
    checkpoints.close()
    await rm(outsideFile, { force: true })
  })
})

describe('Axis durable execution recovery', () => {
  it('reopens an interrupted worker transaction and physically recovers every receipt', async () => {
    const checkpointDatabase = path.join(tempRoot, 'checkpoints.sqlite')
    const transactionDatabase = path.join(tempRoot, 'transactions.sqlite')
    const checkpoints = new FileCheckpointStore(checkpointDatabase)
    const checkpoint = await checkpoints.create('session-1', tempRoot, existingFile)
    const receipts = rollbackReceipts(checkpoint.id)
    const firstJournal = new AxisExecutionTransactionJournal(transactionDatabase, { clock: tickingClock() })
    const prepared = firstJournal.create(transactionInput(receipts))
    const workerStarted = firstJournal.markWorkerStarted({ expectedRevision: prepared.revision, transactionId: prepared.transactionId })
    await writeFile(existingFile, 'after crash')
    await writeFile(newFile, 'created before crash')
    firstJournal.close()
    checkpoints.close()

    const reopenedCheckpoints = new FileCheckpointStore(checkpointDatabase)
    const reopenedJournal = new AxisExecutionTransactionJournal(transactionDatabase, { clock: tickingClock() })
    expect(reopenedJournal.get(workerStarted.transactionId)).toMatchObject({ status: 'worker-started' })
    const recovery = new AxisExecutionRecoveryCoordinator({
      journal: reopenedJournal,
      rollback: new AxisPhysicalRollbackExecutor({ checkpoints: reopenedCheckpoints }),
    })

    const recovered = await recovery.recoverPending()

    expect(recovered).toEqual([expect.objectContaining({ status: 'rolled-back', revision: 5 })])
    expect(reopenedJournal.listRecoverable()).toEqual([])
    await expect(readFile(existingFile, 'utf8')).resolves.toBe('before')
    await expect(readFile(newFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    reopenedJournal.close()
    reopenedCheckpoints.close()

    const finalJournal = new AxisExecutionTransactionJournal(transactionDatabase)
    expect(finalJournal.get(workerStarted.transactionId)).toMatchObject({ status: 'rolled-back', revision: 5 })
    finalJournal.close()
  })

  it('replays a crash during rollback and leaves missing-checkpoint evidence recoverable', async () => {
    const transactionDatabase = path.join(tempRoot, 'transactions.sqlite')
    const checkpoints = new FileCheckpointStore()
    const journal = new AxisExecutionTransactionJournal(transactionDatabase, { clock: tickingClock() })
    const prepared = journal.create(transactionInput([{
      checkpointId: 'checkpoint-missing',
      filePath: existingFile,
      priorState: 'existing-file',
      rollbackAction: 'restore-checkpoint',
    }]))
    const started = journal.markWorkerStarted({ expectedRevision: prepared.revision, transactionId: prepared.transactionId })
    const pending = journal.markRollbackPending({ expectedRevision: started.revision, transactionId: started.transactionId })
    const rolling = journal.startRollback({ expectedRevision: pending.revision, transactionId: pending.transactionId })
    journal.close()

    const reopened = new AxisExecutionTransactionJournal(transactionDatabase, { clock: tickingClock() })
    expect(reopened.get(rolling.transactionId)).toMatchObject({ status: 'rolling-back' })
    const recovery = new AxisExecutionRecoveryCoordinator({
      journal: reopened,
      rollback: new AxisPhysicalRollbackExecutor({ checkpoints }),
    })

    const [result] = await recovery.recoverPending()

    expect(result).toMatchObject({ status: 'rollback-incomplete', revision: 5 })
    expect(result!.rollbackOutcomes[0]).toMatchObject({ status: 'failed' })
    expect(reopened.listRecoverable()).toEqual([expect.objectContaining({ transactionId: rolling.transactionId })])
    reopened.close()
    checkpoints.close()
  })

  it('rejects stale transaction revisions', () => {
    const journal = new AxisExecutionTransactionJournal(':memory:', { clock: tickingClock() })
    const prepared = journal.create(transactionInput([{
      checkpointId: null,
      filePath: newFile,
      priorState: 'new-file',
      rollbackAction: 'delete-created-file',
    }]))

    journal.markWorkerStarted({ expectedRevision: prepared.revision, transactionId: prepared.transactionId })

    expect(() => journal.markRollbackPending({ expectedRevision: prepared.revision, transactionId: prepared.transactionId })).toThrow(/revision conflict/i)
    journal.close()
  })
})

function rollbackReceipts(checkpointId: string): AxisCheckpointReceipt[] {
  return [
    { checkpointId, filePath: existingFile, priorState: 'existing-file', rollbackAction: 'restore-checkpoint' },
    { checkpointId: null, filePath: newFile, priorState: 'new-file', rollbackAction: 'delete-created-file' },
  ]
}

function rollbackRequest(receipts: AxisCheckpointReceipt[]) {
  return { projectRoot: tempRoot, receipts, runId: 'run-1', sessionId: 'session-1', taskId: 'task-1' }
}

function transactionInput(receipts: AxisCheckpointReceipt[]) {
  return { ...rollbackRequest(receipts), transactionId: 'transaction-1' }
}

function tickingClock(): () => Date {
  let tick = 0
  return () => new Date(Date.parse('2026-07-22T05:00:00.000Z') + tick++ * 1_000)
}
