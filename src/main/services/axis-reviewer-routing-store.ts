import Database from 'better-sqlite3'
import { AxisReviewerRoutingConfigSchema, AxisReviewerRoutingUpdateSchema, type AxisReviewerRoutingConfig, type AxisReviewerRoutingUpdate } from '../../shared/axis-reviewer-qualification-contracts'
import type { ProviderConfig } from '../../shared/types/domain'
import type { AxisReviewerQualificationEvidencePort } from './axis-reviewer-qualification-registry'
import { migrateAxisReviewerSettings } from './axis-reviewer-settings-migrations'

const DEFAULT = (): AxisReviewerRoutingConfig => ({ revision: 0, routing: { correctness: null, correctnessFallback: null, enabled: false, security: null, securityFallback: null }, schemaVersion: 1, updatedAt: new Date(0).toISOString() })
export class AxisReviewerRoutingStore {
  private readonly db: Database
  constructor(private readonly options: { databasePath?: string; providers: { get(id: string): ProviderConfig | null }; qualifications: AxisReviewerQualificationEvidencePort }) {
    this.db = new Database(options.databasePath ?? ':memory:'); this.db.pragma('journal_mode = WAL')
    migrateAxisReviewerSettings(this.db)
  }
  read(): AxisReviewerRoutingConfig {
    const row = this.db.prepare('SELECT revision, config_json FROM axis_reviewer_routing WHERE singleton=1').get() as { revision: number; config_json: string } | undefined
    if (!row) return DEFAULT()
    const value = AxisReviewerRoutingConfigSchema.parse(JSON.parse(row.config_json) as unknown)
    if (value.revision !== row.revision) throw new Error('Reviewer routing revision mismatch')
    return value
  }
  readQualified(): AxisReviewerRoutingConfig | null {
    const config = this.read()
    if (!config.routing.enabled) return null
    try { this.validateQualified(config.routing); return config } catch { return null }
  }
  update(input: AxisReviewerRoutingUpdate): AxisReviewerRoutingConfig {
    const request = AxisReviewerRoutingUpdateSchema.parse(input); const current = this.read()
    if (current.revision !== request.expectedRevision) throw new Error('Reviewer routing revision conflict')
    if (request.routing.enabled) this.validateQualified(request.routing)
    const value = AxisReviewerRoutingConfigSchema.parse({ revision: current.revision + 1, routing: request.routing, schemaVersion: 1, updatedAt: new Date().toISOString() })
    this.db.prepare(`INSERT INTO axis_reviewer_routing VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision, config_json=excluded.config_json`).run(value.revision, JSON.stringify(value))
    return value
  }
  private validateQualified(routing: AxisReviewerRoutingUpdate['routing']): void {
    for (const identity of [routing.correctness, routing.security, routing.correctnessFallback, routing.securityFallback]) {
      if (!identity) continue
      const provider = this.options.providers.get(identity.providerId)
      if (!provider?.hasApiKey) throw new Error('Reviewer route Provider is not configured')
      if (!provider.isActive) throw new Error('Reviewer route Provider must be active')
      if (provider.model === identity.modelId) throw new Error('Reviewer model must be independent from Worker')
      if (!this.options.qualifications.findCurrent(identity.providerId, identity.modelId, provider.updatedAt)) throw new Error('Reviewer model is not currently qualified')
    }
  }
  close(): void { this.db.close() }
}
