import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  AxisWorkerAttemptBindingSchema,
} from '../../shared/axis-worker-attempt-contracts'
import {
  AxisWorkerDiscardCreateInputSchema,
  AxisWorkerDiscardReceiptSchema,
  type AxisWorkerDiscardCreateInput,
  type AxisWorkerDiscardReceipt,
} from '../../shared/axis-worker-discard-contracts'
import type {
  AxisWorkerAttemptReaderPort,
} from './axis-worker-attempt-ports'
import type {
  AxisWorkerDiscardPort,
} from './axis-worker-discard-ports'

interface DiscardRow {
  receipt_json: string
}

const DecisionIdSchema = z.string().trim().min(1).max(160)

export class AxisWorkerDiscardRegistry {
  private readonly attempts: AxisWorkerAttemptReaderPort
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(
    databasePath = ':memory:',
    options: {
      attempts: AxisWorkerAttemptReaderPort
      clock?: () => Date
      idFactory?: () => string
    },
  ) {
    this.attempts = options.attempts
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => `discard-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_worker_discards (
        discard_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        source_attempt_id TEXT NOT NULL,
        source_worker_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_worker_discard_owner
        ON axis_worker_discards(run_id, session_id, task_id);
    `)
  }

  openDiscardPort(): AxisWorkerDiscardPort {
    const port: AxisWorkerDiscardPort = {
      discard: (input) => this.discard(input),
      findByDecision: (decisionId) => this.findByDecision(decisionId),
    }
    return Object.freeze(port)
  }

  discard(
    inputValue: AxisWorkerDiscardCreateInput,
  ): AxisWorkerDiscardReceipt {
    const input = AxisWorkerDiscardCreateInputSchema.parse(inputValue)
    return this.db.transaction(() => {
      if (this.findByDecision(input.decisionId)) {
        throw new Error(
          `Axis Worker discard decision already recorded: ${input.decisionId}`,
        )
      }
      const foundAttempt = this.attempts.findLatest({
        runId: input.runId,
        sessionId: input.sessionId,
        taskId: input.taskId,
      })
      if (!foundAttempt) {
        throw new Error(
          `Axis Worker discard source attempt not found: ${input.sourceAttemptId}`,
        )
      }
      const attempt = AxisWorkerAttemptBindingSchema.parse(foundAttempt)
      if (
        attempt.attemptId !== input.sourceAttemptId
        || attempt.attempt !== input.sourceAttempt
        || attempt.workerId !== input.sourceWorkerId
        || attempt.runId !== input.runId
        || attempt.sessionId !== input.sessionId
        || attempt.taskId !== input.taskId
      ) {
        throw new Error('Axis Worker discard source attempt ownership mismatch')
      }
      if (attempt.status !== 'failed') {
        throw new Error(
          `Axis Worker discard requires a failed attempt, received ${attempt.status}`,
        )
      }
      const receipt = AxisWorkerDiscardReceiptSchema.parse({
        ...input,
        createdAt: this.clock().toISOString(),
        discardId: this.idFactory(),
        schemaVersion: 1,
        status: 'discarded',
      })
      this.db.prepare(`
        INSERT INTO axis_worker_discards (
          discard_id, decision_id, run_id, session_id, task_id,
          source_attempt_id, source_worker_id, created_at, receipt_json
        ) VALUES (
          @discardId, @decisionId, @runId, @sessionId, @taskId,
          @sourceAttemptId, @sourceWorkerId, @createdAt, @receiptJson
        )
      `).run({
        createdAt: receipt.createdAt,
        decisionId: receipt.decisionId,
        discardId: receipt.discardId,
        receiptJson: JSON.stringify(receipt),
        runId: receipt.runId,
        sessionId: receipt.sessionId,
        sourceAttemptId: receipt.sourceAttemptId,
        sourceWorkerId: receipt.sourceWorkerId,
        taskId: receipt.taskId,
      })
      return receipt
    })()
  }

  findByDecision(decisionIdValue: string): AxisWorkerDiscardReceipt | null {
    const decisionId = DecisionIdSchema.parse(decisionIdValue)
    const row = this.db.prepare(`
      SELECT receipt_json FROM axis_worker_discards WHERE decision_id = ?
    `).get(decisionId) as DiscardRow | undefined
    return row
      ? AxisWorkerDiscardReceiptSchema.parse(
          JSON.parse(row.receipt_json) as unknown,
        )
      : null
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_worker_discards WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}
