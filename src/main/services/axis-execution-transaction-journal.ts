import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisCheckpointReceiptSchema,
  AxisExecutionTransactionSchema,
  AxisRollbackOutcomeSchema,
  type AxisCheckpointReceipt,
  type AxisExecutionTransaction,
  type AxisRollbackOutcome,
} from '../../shared/axis-engine-contracts'

interface TransactionRow {
  revision: number
  transaction_json: string
}

export interface AxisTransactionRevisionRequest {
  expectedRevision: number
  transactionId: string
}

export interface AxisExecutionTransactionCreateInput {
  projectRoot: string
  receipts: AxisCheckpointReceipt[]
  runId: string
  sessionId: string
  taskId: string
  transactionId?: string
}

export interface AxisExecutionTransactionPort {
  create(input: AxisExecutionTransactionCreateInput): AxisExecutionTransaction
  finishRollback(request: AxisTransactionRevisionRequest & { outcomes: AxisRollbackOutcome[] }): AxisExecutionTransaction
  markCompleted(request: AxisTransactionRevisionRequest): AxisExecutionTransaction
  markRollbackPending(request: AxisTransactionRevisionRequest): AxisExecutionTransaction
  markWorkerStarted(request: AxisTransactionRevisionRequest): AxisExecutionTransaction
  startRollback(request: AxisTransactionRevisionRequest): AxisExecutionTransaction
}

export class AxisExecutionTransactionJournal implements AxisExecutionTransactionPort {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(databasePath = ':memory:', options: { clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_execution_transactions (
        transaction_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        transaction_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_execution_transactions_recovery
        ON axis_execution_transactions(status, updated_at ASC);
      CREATE INDEX IF NOT EXISTS idx_axis_execution_transactions_session
        ON axis_execution_transactions(session_id, updated_at DESC);
    `)
  }

  create(input: AxisExecutionTransactionCreateInput): AxisExecutionTransaction {
    const timestamp = this.clock().toISOString()
    const transaction = AxisExecutionTransactionSchema.parse({
      checkpointReceipts: input.receipts.map((receipt) => AxisCheckpointReceiptSchema.parse(receipt)),
      createdAt: timestamp,
      projectRoot: input.projectRoot,
      revision: 1,
      rollbackOutcomes: [],
      runId: input.runId,
      schemaVersion: 1,
      sessionId: input.sessionId,
      status: 'prepared',
      taskId: input.taskId,
      transactionId: input.transactionId ?? `axis-transaction-${randomUUID()}`,
      updatedAt: timestamp,
    })
    this.db.prepare(`
      INSERT INTO axis_execution_transactions (
        transaction_id, run_id, session_id, task_id, status, revision, updated_at, transaction_json
      ) VALUES (@transactionId, @runId, @sessionId, @taskId, @status, @revision, @updatedAt, @transactionJson)
    `).run(rowInput(transaction))
    return transaction
  }

  get(transactionId: string): AxisExecutionTransaction | null {
    const row = this.db.prepare(`
      SELECT revision, transaction_json FROM axis_execution_transactions WHERE transaction_id = ?
    `).get(transactionId) as TransactionRow | undefined
    return row ? parseRow(row) : null
  }

  listRecoverable(limit = 100): AxisExecutionTransaction[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error('Axis recovery limit must be between 1 and 1000')
    return (this.db.prepare(`
      SELECT revision, transaction_json FROM axis_execution_transactions
      WHERE status IN ('worker-started', 'rollback-pending', 'rolling-back', 'rollback-incomplete')
      ORDER BY updated_at ASC, transaction_id ASC LIMIT ?
    `).all(limit) as TransactionRow[]).map(parseRow)
  }

  listForRun(runId: string): AxisExecutionTransaction[] {
    return (this.db.prepare(`
      SELECT revision, transaction_json FROM axis_execution_transactions
      WHERE run_id = ? ORDER BY updated_at ASC, transaction_id ASC
    `).all(runId) as TransactionRow[]).map(parseRow)
  }

  markWorkerStarted(request: AxisTransactionRevisionRequest): AxisExecutionTransaction {
    return this.transition(request, ['prepared'], 'worker-started')
  }

  markCompleted(request: AxisTransactionRevisionRequest): AxisExecutionTransaction {
    return this.transition(request, ['worker-started'], 'completed')
  }

  markRollbackPending(request: AxisTransactionRevisionRequest): AxisExecutionTransaction {
    return this.transition(request, ['worker-started'], 'rollback-pending')
  }

  startRollback(request: AxisTransactionRevisionRequest): AxisExecutionTransaction {
    return this.transition(request, ['rollback-pending', 'rollback-incomplete'], 'rolling-back')
  }

  finishRollback(request: AxisTransactionRevisionRequest & { outcomes: AxisRollbackOutcome[] }): AxisExecutionTransaction {
    const outcomes = request.outcomes.map((outcome) => AxisRollbackOutcomeSchema.parse(outcome))
    return this.transition(request, ['rolling-back'], outcomes.some((outcome) => outcome.status === 'failed') ? 'rollback-incomplete' : 'rolled-back', outcomes)
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare('DELETE FROM axis_execution_transactions WHERE session_id = ?').run(sessionId).changes
  }

  close(): void {
    this.db.close()
  }

  private transition(
    request: AxisTransactionRevisionRequest,
    allowedStatuses: AxisExecutionTransaction['status'][],
    status: AxisExecutionTransaction['status'],
    rollbackOutcomes: AxisRollbackOutcome[] = [],
  ): AxisExecutionTransaction {
    return this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT revision, transaction_json FROM axis_execution_transactions WHERE transaction_id = ?
      `).get(request.transactionId) as TransactionRow | undefined
      if (!row) throw new Error(`Axis execution transaction not found: ${request.transactionId}`)
      const current = parseRow(row)
      if (current.revision !== request.expectedRevision) {
        throw new Error(`Axis execution transaction revision conflict: expected ${request.expectedRevision}, current ${current.revision}`)
      }
      if (!allowedStatuses.includes(current.status)) {
        throw new Error(`Invalid Axis execution transaction transition: ${current.status} -> ${status}`)
      }
      const clockTime = this.clock().getTime()
      const updatedAt = new Date(Math.max(clockTime, Date.parse(current.updatedAt) + 1)).toISOString()
      const next = AxisExecutionTransactionSchema.parse({
        ...current,
        revision: current.revision + 1,
        rollbackOutcomes,
        status,
        updatedAt,
      })
      const update = this.db.prepare(`
        UPDATE axis_execution_transactions
        SET status = @status, revision = @revision, updated_at = @updatedAt, transaction_json = @transactionJson
        WHERE transaction_id = @transactionId AND revision = @expectedRevision
      `).run({ ...rowInput(next), expectedRevision: request.expectedRevision })
      if (update.changes !== 1) throw new Error(`Axis execution transaction revision conflict: ${request.transactionId}`)
      return next
    })()
  }
}

function rowInput(transaction: AxisExecutionTransaction): Record<string, number | string> {
  return {
    revision: transaction.revision,
    runId: transaction.runId,
    sessionId: transaction.sessionId,
    status: transaction.status,
    taskId: transaction.taskId,
    transactionId: transaction.transactionId,
    transactionJson: JSON.stringify(transaction),
    updatedAt: transaction.updatedAt,
  }
}

function parseRow(row: TransactionRow): AxisExecutionTransaction {
  const transaction = AxisExecutionTransactionSchema.parse(JSON.parse(row.transaction_json) as unknown)
  if (transaction.revision !== row.revision) throw new Error(`Axis execution transaction revision mismatch: ${transaction.transactionId}`)
  return transaction
}
