import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { AxisReviewerQualificationEvidenceSchema, type AxisReviewerQualificationEvidence } from '../../shared/axis-reviewer-qualification-contracts'
import { migrateAxisReviewerSettings } from './axis-reviewer-settings-migrations'

export interface AxisReviewerQualificationEvidencePort {
  record(input: Omit<AxisReviewerQualificationEvidence, 'evidenceId'>): AxisReviewerQualificationEvidence
  findCurrent(providerId: string, modelId: string, providerRevision: string): AxisReviewerQualificationEvidence | null
}

export class AxisReviewerQualificationRegistry implements AxisReviewerQualificationEvidencePort {
  private readonly db: Database
  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath); this.db.pragma('journal_mode = WAL')
    migrateAxisReviewerSettings(this.db)
  }
  record(input: Omit<AxisReviewerQualificationEvidence, 'evidenceId'>): AxisReviewerQualificationEvidence {
    const existing = this.findCurrent(input.providerId, input.modelId, input.providerRevision)
    if (existing) return existing
    const evidence = AxisReviewerQualificationEvidenceSchema.parse({ ...input, evidenceId: `reviewer-qualification-${randomUUID()}` })
    this.db.prepare(`INSERT INTO axis_reviewer_qualifications VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id, provider_revision) DO UPDATE SET
      evidence_id=excluded.evidence_id, evidence_json=excluded.evidence_json`).run(
      evidence.evidenceId, evidence.providerId, evidence.modelId, evidence.providerRevision, JSON.stringify(evidence))
    return evidence
  }
  findCurrent(providerId: string, modelId: string, providerRevision: string): AxisReviewerQualificationEvidence | null {
    const row = this.db.prepare(`SELECT evidence_json FROM axis_reviewer_qualifications WHERE provider_id=? AND model_id=? AND provider_revision=?`).get(providerId, modelId, providerRevision) as { evidence_json: string } | undefined
    if (!row) return null
    const value = AxisReviewerQualificationEvidenceSchema.parse(JSON.parse(row.evidence_json) as unknown)
    return Date.parse(value.expiresAt) > Date.now() ? value : null
  }
  close(): void { this.db.close() }
}
