import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisAuthorityAuditEntrySchema,
  type AxisAuthorityAuditEntry,
  type AxisExecutionAuthorityEnvelope,
  type AxisFakeMutationReceipt,
  type AxisSafeWriteReceipt,
} from '../../shared/axis-engine-contracts'

interface AuditRow {
  entry_json: string
  sequence: number
}

export interface AxisAuthorityAuditPort {
  recordIssued(envelope: AxisExecutionAuthorityEnvelope): AxisAuthorityAuditEntry
  recordMutation(receipt: AxisFakeMutationReceipt): AxisAuthorityAuditEntry
  recordWrite(receipt: AxisSafeWriteReceipt): AxisAuthorityAuditEntry
}

export class AxisAuthorityAuditRegistry implements AxisAuthorityAuditPort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_authority_audit (
        entry_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        entry_json TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_authority_audit_run_sequence
        ON axis_authority_audit(run_id, sequence ASC);
    `)
  }

  recordIssued(envelope: AxisExecutionAuthorityEnvelope): AxisAuthorityAuditEntry {
    return this.append({ envelope, type: 'authority-issued' })
  }

  recordMutation(receipt: AxisFakeMutationReceipt): AxisAuthorityAuditEntry {
    return this.append({ receipt, type: 'mutation-simulated' })
  }

  recordWrite(receipt: AxisSafeWriteReceipt): AxisAuthorityAuditEntry {
    return this.append({ receipt, type: 'mutation-written' })
  }

  list(runId: string): AxisAuthorityAuditEntry[] {
    const rows = this.db.prepare('SELECT sequence, entry_json FROM axis_authority_audit WHERE run_id = ? ORDER BY sequence ASC').all(runId) as AuditRow[]
    return rows.map((row, index) => {
      const entry = AxisAuthorityAuditEntrySchema.parse(JSON.parse(row.entry_json) as unknown)
      if (row.sequence !== index + 1 || entry.sequence !== row.sequence) throw new Error(`Axis authority audit sequence is not contiguous: ${runId}`)
      return entry
    })
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare('DELETE FROM axis_authority_audit WHERE session_id = ?').run(sessionId).changes
  }

  close(): void {
    this.db.close()
  }

  private append(payload:
    | { envelope: AxisExecutionAuthorityEnvelope; type: 'authority-issued' }
    | { receipt: AxisFakeMutationReceipt; type: 'mutation-simulated' }
    | { receipt: AxisSafeWriteReceipt; type: 'mutation-written' }
  ): AxisAuthorityAuditEntry {
    return this.db.transaction(() => {
      const ownership = payload.type === 'authority-issued'
        ? { recordedAt: payload.envelope.issuedAt, runId: payload.envelope.runId, sessionId: payload.envelope.sessionId, taskId: payload.envelope.taskId }
        : { recordedAt: payload.receipt.timestamp, runId: payload.receipt.runId, sessionId: payload.receipt.sessionId, taskId: payload.receipt.taskId }
      const sequence = ((this.db.prepare('SELECT MAX(sequence) AS value FROM axis_authority_audit WHERE run_id = ?').get(ownership.runId) as { value: number | null }).value ?? 0) + 1
      const entry = AxisAuthorityAuditEntrySchema.parse({
        ...payload,
        entryId: `authority-audit-${randomUUID()}`,
        recordedAt: ownership.recordedAt,
        runId: ownership.runId,
        sequence,
        sessionId: ownership.sessionId,
        taskId: ownership.taskId,
      })
      this.db.prepare(`
        INSERT INTO axis_authority_audit (entry_id, run_id, session_id, task_id, sequence, recorded_at, entry_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(entry.entryId, entry.runId, entry.sessionId, entry.taskId, entry.sequence, entry.recordedAt, JSON.stringify(entry))
      return entry
    })()
  }
}
