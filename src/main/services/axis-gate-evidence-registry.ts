import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisGateRunEvidenceSchema,
  type AxisGateRunEvidence,
} from '../../shared/axis-engine-contracts'

interface EvidenceRow {
  evidence_json: string
  sequence: number
}

export type AxisGateRunEvidenceInput = Omit<AxisGateRunEvidence, 'evidenceId' | 'sequence'>

export interface AxisGateEvidencePort {
  record(evidence: AxisGateRunEvidenceInput): AxisGateRunEvidence
}

export class AxisGateEvidenceRegistry implements AxisGateEvidencePort {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_gate_evidence (
        evidence_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        cycle INTEGER NOT NULL,
        gate TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        UNIQUE(run_id, task_id, cycle, gate),
        UNIQUE(run_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_axis_gate_evidence_run
        ON axis_gate_evidence(run_id, sequence ASC);
      CREATE INDEX IF NOT EXISTS idx_axis_gate_evidence_task
        ON axis_gate_evidence(run_id, task_id, cycle, sequence ASC);
    `)
  }

  record(input: AxisGateRunEvidenceInput): AxisGateRunEvidence {
    return this.db.transaction(() => {
      const sequence = ((this.db.prepare(
        'SELECT MAX(sequence) AS value FROM axis_gate_evidence WHERE run_id = ?',
      ).get(input.runId) as { value: number | null }).value ?? 0) + 1
      const evidence = AxisGateRunEvidenceSchema.parse({
        ...input,
        evidenceId: `axis-gate-evidence-${randomUUID()}`,
        sequence,
      })
      this.db.prepare(`
        INSERT INTO axis_gate_evidence (
          evidence_id, run_id, session_id, task_id, cycle, gate, sequence, recorded_at, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        evidence.evidenceId,
        evidence.runId,
        evidence.sessionId,
        evidence.taskId,
        evidence.cycle,
        evidence.gate,
        evidence.sequence,
        evidence.finishedAt,
        JSON.stringify(evidence),
      )
      return evidence
    })()
  }

  listForRun(runId: string): AxisGateRunEvidence[] {
    const rows = this.db.prepare(`
      SELECT sequence, evidence_json FROM axis_gate_evidence
      WHERE run_id = ? ORDER BY sequence ASC
    `).all(runId) as EvidenceRow[]
    return rows.map((row, index) => {
      const evidence = parseRow(row)
      if (row.sequence !== index + 1 || evidence.sequence !== row.sequence) {
        throw new Error(`Axis Gate evidence sequence is not contiguous: ${runId}`)
      }
      return evidence
    })
  }

  listForTask(runId: string, taskId: string): AxisGateRunEvidence[] {
    return (this.db.prepare(`
      SELECT sequence, evidence_json FROM axis_gate_evidence
      WHERE run_id = ? AND task_id = ? ORDER BY sequence ASC
    `).all(runId, taskId) as EvidenceRow[]).map(parseRow)
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare('DELETE FROM axis_gate_evidence WHERE session_id = ?').run(sessionId).changes
  }

  close(): void {
    this.db.close()
  }
}

function parseRow(row: EvidenceRow): AxisGateRunEvidence {
  const evidence = AxisGateRunEvidenceSchema.parse(JSON.parse(row.evidence_json) as unknown)
  if (evidence.sequence !== row.sequence) {
    throw new Error(`Axis Gate evidence sequence mismatch: ${evidence.evidenceId}`)
  }
  return evidence
}
