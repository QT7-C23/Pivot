import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  AxisHumanEscalationCreateInputSchema,
  AxisHumanEscalationReceiptSchema,
  type AxisHumanEscalationCreateInput,
  type AxisHumanEscalationReceipt,
} from '../../shared/axis-human-escalation-contracts'
import type {
  AxisHumanEscalationPort,
} from './axis-human-escalation-ports'

interface EscalationRow {
  receipt_json: string
}

const DecisionIdSchema = z.string().trim().min(1).max(160)

export class AxisHumanEscalationRegistry {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(
    databasePath = ':memory:',
    options: {
      clock?: () => Date
      idFactory?: () => string
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory
      ?? (() => `escalation-${randomUUID()}`)
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_human_escalations (
        escalation_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT,
        category TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_axis_human_escalation_owner
        ON axis_human_escalations(run_id, session_id, task_id);
    `)
  }

  openEscalationPort(): AxisHumanEscalationPort {
    const port: AxisHumanEscalationPort = {
      findByDecision: (decisionId) => this.findByDecision(decisionId),
      open: (input) => this.open(input),
    }
    return Object.freeze(port)
  }

  open(
    inputValue: AxisHumanEscalationCreateInput,
  ): AxisHumanEscalationReceipt {
    const input = AxisHumanEscalationCreateInputSchema.parse(inputValue)
    return this.db.transaction(() => {
      if (this.findByDecision(input.decisionId)) {
        throw new Error(
          `Axis Human escalation decision already recorded: ${input.decisionId}`,
        )
      }
      const receipt = AxisHumanEscalationReceiptSchema.parse({
        ...input,
        escalationId: this.idFactory(),
        openedAt: this.clock().toISOString(),
        schemaVersion: 1,
        status: 'open',
      })
      this.db.prepare(`
        INSERT INTO axis_human_escalations (
          escalation_id, decision_id, run_id, session_id, task_id,
          category, opened_at, receipt_json
        ) VALUES (
          @escalationId, @decisionId, @runId, @sessionId, @taskId,
          @category, @openedAt, @receiptJson
        )
      `).run({
        category: receipt.category,
        decisionId: receipt.decisionId,
        escalationId: receipt.escalationId,
        openedAt: receipt.openedAt,
        receiptJson: JSON.stringify(receipt),
        runId: receipt.runId,
        sessionId: receipt.sessionId,
        taskId: receipt.taskId,
      })
      return receipt
    })()
  }

  findByDecision(
    decisionIdValue: string,
  ): AxisHumanEscalationReceipt | null {
    const decisionId = DecisionIdSchema.parse(decisionIdValue)
    const row = this.db.prepare(`
      SELECT receipt_json
      FROM axis_human_escalations
      WHERE decision_id = ?
    `).get(decisionId) as EscalationRow | undefined
    return row
      ? AxisHumanEscalationReceiptSchema.parse(
          JSON.parse(row.receipt_json) as unknown,
        )
      : null
  }

  deleteForSession(sessionId: string): void {
    this.db.prepare(`
      DELETE FROM axis_human_escalations WHERE session_id = ?
    `).run(sessionId)
  }

  close(): void {
    this.db.close()
  }
}
