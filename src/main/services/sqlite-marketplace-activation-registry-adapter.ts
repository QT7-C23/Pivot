import Database from 'better-sqlite3'
import {
  MarketplaceActivationCommitRequestSchema,
  MarketplaceActivationRecordSchema,
  type MarketplaceActivationCommitRequest,
  type MarketplaceActivationRecord,
} from '../../shared/marketplace-activation-contracts'
import {
  MarketplacePackageArtifactIdentitySchema,
  type MarketplacePackageArtifactIdentity,
} from '../../shared/marketplace-contracts'
import type {
  MarketplaceActivationRegistryReaderPort,
  MarketplaceActivationRegistryWriterPort,
} from './marketplace-activation-ports'

interface ActivationRow { identity_key: string; record_json: string; revision: number }
const CURRENT_MIGRATION_VERSION = 1

export class SqliteMarketplaceActivationRegistryAdapter {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(options: { readonly clock?: () => Date; readonly databasePath?: string } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  openReaderPort(): MarketplaceActivationRegistryReaderPort {
    return Object.freeze({
      get: (identity: MarketplacePackageArtifactIdentity) => this.get(identity),
      listActive: () => this.listActive(),
    })
  }

  openWriterPort(): MarketplaceActivationRegistryWriterPort {
    return Object.freeze({
      activate: (request: MarketplaceActivationCommitRequest) => this.activate(request),
      deactivate: (identity: MarketplacePackageArtifactIdentity, expectedRevision: number) => this.deactivate(identity, expectedRevision),
    })
  }

  close(): void { this.db.close() }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_activation_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = this.db.prepare(
      'SELECT 1 FROM marketplace_activation_migrations WHERE version = ?',
    ).get(CURRENT_MIGRATION_VERSION)
    if (applied) return
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE marketplace_activations (
          identity_key TEXT PRIMARY KEY,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          record_json TEXT NOT NULL,
          activated_at TEXT NOT NULL
        );
      `)
      this.db.prepare(`
        INSERT INTO marketplace_activation_migrations (version, applied_at) VALUES (?, ?)
      `).run(CURRENT_MIGRATION_VERSION, this.clock().toISOString())
    })()
  }

  private activate(input: MarketplaceActivationCommitRequest): MarketplaceActivationRecord {
    const request = MarketplaceActivationCommitRequestSchema.parse(input)
    const identityKey = keyOf(request.identity)
    return this.db.transaction(() => {
      if (this.readRow(identityKey)) throw new Error('Marketplace resource is already active')
      const record = MarketplaceActivationRecordSchema.parse({
        activatedAt: this.clock().toISOString(),
        capabilities: request.capabilities,
        identity: request.identity,
        installationRevision: request.installationRevision,
        registrationId: request.registrationId,
        revision: 0,
        schemaVersion: 1,
        state: 'active',
      })
      this.db.prepare(`
        INSERT INTO marketplace_activations (
          identity_key, revision, record_json, activated_at
        ) VALUES (?, ?, ?, ?)
      `).run(identityKey, record.revision, JSON.stringify(record), record.activatedAt)
      return record
    })()
  }

  private get(identity: MarketplacePackageArtifactIdentity): MarketplaceActivationRecord | null {
    return this.parseRow(this.readRow(keyOf(identity)))
  }

  private deactivate(identity: MarketplacePackageArtifactIdentity, expectedRevision: number): void {
    const identityKey = keyOf(identity)
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error('Marketplace activation revision is invalid')
    }
    this.db.transaction(() => {
      const current = this.parseRow(this.readRow(identityKey))
      if (!current) return
      if (current.revision !== expectedRevision) throw new Error('Marketplace activation revision is stale')
      const result = this.db.prepare(
        'DELETE FROM marketplace_activations WHERE identity_key = ? AND revision = ?',
      ).run(identityKey, expectedRevision)
      if (result.changes !== 1) throw new Error('Marketplace activation changed during deactivation')
    })()
  }

  private listActive(): readonly MarketplaceActivationRecord[] {
    return Object.freeze((this.db.prepare(`
      SELECT identity_key, record_json, revision FROM marketplace_activations
      ORDER BY identity_key
    `).all() as ActivationRow[]).map((row) => this.parseRow(row)!))
  }

  private readRow(identityKey: string): ActivationRow | undefined {
    return this.db.prepare(`
      SELECT identity_key, record_json, revision FROM marketplace_activations
      WHERE identity_key = ?
    `).get(identityKey) as ActivationRow | undefined
  }

  private parseRow(row: ActivationRow | undefined): MarketplaceActivationRecord | null {
    if (!row) return null
    try {
      const record = MarketplaceActivationRecordSchema.parse(JSON.parse(row.record_json) as unknown)
      if (keyOf(record.identity) !== row.identity_key || record.revision !== row.revision) {
        throw new Error('Marketplace activation row identity mismatch')
      }
      return record
    } catch (error) {
      throw new Error('Invalid persisted Marketplace activation record', { cause: error })
    }
  }
}

function keyOf(input: unknown): string {
  return JSON.stringify(MarketplacePackageArtifactIdentitySchema.parse(input))
}
