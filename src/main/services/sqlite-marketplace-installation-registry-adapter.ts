import Database from 'better-sqlite3'
import {
  MarketplacePackageArtifactIdentitySchema,
  type MarketplacePackageArtifactIdentity,
} from '../../shared/marketplace-contracts'
import {
  MarketplaceInstallationBeginRequestSchema,
  MarketplaceInstallationDeleteRequestSchema,
  MarketplaceInstallationRecordSchema,
  MarketplaceInstallationTransitionRequestSchema,
  type MarketplaceInstallationBeginRequest,
  type MarketplaceInstallationDeleteRequest,
  type MarketplaceInstallationRecord,
  type MarketplaceInstallationTransitionRequest,
} from '../../shared/marketplace-installation-contracts'
import type {
  MarketplaceInstallationRegistryReaderPort,
  MarketplaceInstallationRegistryWriterPort,
} from './marketplace-installation-ports'

interface InstallationRow {
  identity_key: string
  record_json: string
  revision: number
  state: string
}

const CURRENT_MIGRATION_VERSION = 1

export class SqliteMarketplaceInstallationRegistryAdapter {
  private readonly clock: () => Date
  private readonly db: Database

  constructor(options: { readonly clock?: () => Date; readonly databasePath?: string } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  openReaderPort(): MarketplaceInstallationRegistryReaderPort {
    return Object.freeze({
      get: (identity: MarketplacePackageArtifactIdentity) => this.get(identity),
      listInstalled: () => this.listInstalled(),
      listRecoverable: () => this.listRecoverable(),
    })
  }

  openWriterPort(): MarketplaceInstallationRegistryWriterPort {
    return Object.freeze({
      begin: (request: MarketplaceInstallationBeginRequest) => this.begin(request),
      delete: (request: MarketplaceInstallationDeleteRequest) => this.delete(request),
      transition: (request: MarketplaceInstallationTransitionRequest) => this.transition(request),
    })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_installation_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = this.db.prepare(
      'SELECT 1 FROM marketplace_installation_migrations WHERE version = ?',
    ).get(CURRENT_MIGRATION_VERSION)
    if (applied) return
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE marketplace_installations (
          identity_key TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_marketplace_installations_state
          ON marketplace_installations(state, identity_key);
      `)
      this.db.prepare(`
        INSERT INTO marketplace_installation_migrations (version, applied_at) VALUES (?, ?)
      `).run(CURRENT_MIGRATION_VERSION, this.clock().toISOString())
    })()
  }

  private begin(input: MarketplaceInstallationBeginRequest): MarketplaceInstallationRecord {
    const request = MarketplaceInstallationBeginRequestSchema.parse(input)
    const identityKey = keyOf(request.review.identity)
    return this.db.transaction(() => {
      if (this.readRow(identityKey)) throw new Error('Marketplace package installation already exists')
      const timestamp = this.clock().toISOString()
      const record = MarketplaceInstallationRecordSchema.parse({
        capabilities: request.review.approvedCapabilities,
        createdAt: timestamp,
        identity: request.review.identity,
        manifestEvidence: request.manifestEvidence,
        revision: 0,
        schemaVersion: 1,
        state: 'installing',
        storageKey: request.storageKey,
        updatedAt: timestamp,
      })
      this.insert(identityKey, record)
      return record
    })()
  }

  private transition(input: MarketplaceInstallationTransitionRequest): MarketplaceInstallationRecord {
    const request = MarketplaceInstallationTransitionRequestSchema.parse(input)
    const identityKey = keyOf(request.identity)
    return this.db.transaction(() => {
      const current = this.parseRow(this.readRow(identityKey))
      if (!current) throw new Error('Marketplace installation does not exist')
      if (current.revision !== request.expectedRevision) {
        throw new Error('Marketplace installation revision is stale')
      }
      requireTransition(current.state, request.state)
      const next = MarketplaceInstallationRecordSchema.parse({
        ...current,
        error: request.error,
        revision: current.revision + 1,
        state: request.state,
        updatedAt: this.clock().toISOString(),
      })
      const result = this.db.prepare(`
        UPDATE marketplace_installations
        SET state = ?, revision = ?, record_json = ?, updated_at = ?
        WHERE identity_key = ? AND revision = ?
      `).run(next.state, next.revision, JSON.stringify(next), next.updatedAt, identityKey, current.revision)
      if (result.changes !== 1) throw new Error('Marketplace installation revision changed concurrently')
      return next
    })()
  }

  private delete(input: MarketplaceInstallationDeleteRequest): void {
    const request = MarketplaceInstallationDeleteRequestSchema.parse(input)
    const identityKey = keyOf(request.identity)
    this.db.transaction(() => {
      const current = this.parseRow(this.readRow(identityKey))
      if (!current) return
      if (current.revision !== request.expectedRevision || current.state !== 'removing') {
        throw new Error('Marketplace installation removal revision or state is stale')
      }
      const result = this.db.prepare(`
        DELETE FROM marketplace_installations WHERE identity_key = ? AND revision = ?
      `).run(identityKey, current.revision)
      if (result.changes !== 1) throw new Error('Marketplace installation changed during removal')
    })()
  }

  private get(identity: unknown): MarketplaceInstallationRecord | null {
    return this.parseRow(this.readRow(keyOf(identity)))
  }

  private listRecoverable(): readonly MarketplaceInstallationRecord[] {
    return Object.freeze((this.db.prepare(`
      SELECT identity_key, state, revision, record_json
      FROM marketplace_installations WHERE state IN ('installing', 'removing', 'failed')
      ORDER BY identity_key
    `).all() as InstallationRow[]).map((row) => this.parseRow(row)!))
  }

  private listInstalled(): readonly MarketplaceInstallationRecord[] {
    return Object.freeze((this.db.prepare(`
      SELECT identity_key, state, revision, record_json
      FROM marketplace_installations WHERE state = 'installed'
      ORDER BY identity_key
    `).all() as InstallationRow[]).map((row) => this.parseRow(row)!))
  }

  private readRow(identityKey: string): InstallationRow | undefined {
    return this.db.prepare(`
      SELECT identity_key, state, revision, record_json
      FROM marketplace_installations WHERE identity_key = ?
    `).get(identityKey) as InstallationRow | undefined
  }

  private parseRow(row: InstallationRow | undefined): MarketplaceInstallationRecord | null {
    if (!row) return null
    try {
      const record = MarketplaceInstallationRecordSchema.parse(JSON.parse(row.record_json) as unknown)
      if (keyOf(record.identity) !== row.identity_key
        || record.state !== row.state || record.revision !== row.revision) {
        throw new Error('Marketplace installation row identity mismatch')
      }
      return record
    } catch (error) {
      throw new Error('Invalid persisted Marketplace installation record', { cause: error })
    }
  }

  private insert(identityKey: string, record: MarketplaceInstallationRecord): void {
    this.db.prepare(`
      INSERT INTO marketplace_installations (identity_key, state, revision, record_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(identityKey, record.state, record.revision, JSON.stringify(record), record.updatedAt)
  }
}

function keyOf(input: unknown): string {
  return JSON.stringify(MarketplacePackageArtifactIdentitySchema.parse(input))
}

function requireTransition(current: string, next: string): void {
  const allowed: Record<string, readonly string[]> = {
    installed: ['removing'],
    installing: ['failed', 'installed'],
    removing: ['failed'],
  }
  if (!allowed[current]?.includes(next)) {
    throw new Error(`Invalid Marketplace installation transition: ${current} -> ${next}`)
  }
}
