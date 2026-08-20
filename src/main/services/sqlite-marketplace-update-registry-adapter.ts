import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  MarketplaceUpdateBeginRequestSchema,
  MarketplaceUpdateRecordSchema,
  MarketplaceUpdateTransitionRequestSchema,
  type MarketplaceUpdateBeginRequest,
  type MarketplaceUpdateRecord,
  type MarketplaceUpdateTransitionRequest,
} from '../../shared/marketplace-update-contracts'
import type { MarketplaceUpdateEvidencePort } from './marketplace-update-ports'

interface UpdateRow { record_json: string; revision: number; state: string; update_id: string }
const CURRENT_MIGRATION_VERSION = 1

export class SqliteMarketplaceUpdateRegistryAdapter {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly idFactory: () => string

  constructor(options: {
    readonly clock?: () => Date
    readonly databasePath?: string
    readonly idFactory?: () => string
  } = {}) {
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => `marketplace-update-${randomUUID()}`)
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  openPort(): MarketplaceUpdateEvidencePort {
    return Object.freeze({
      begin: (request: MarketplaceUpdateBeginRequest) => this.begin(request),
      find: (updateId: string) => this.find(updateId),
      listReady: () => this.listReady(),
      transition: (request: MarketplaceUpdateTransitionRequest) => this.transition(request),
    })
  }

  close(): void { this.db.close() }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_update_migrations (
        version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
      );
    `)
    if (this.db.prepare('SELECT 1 FROM marketplace_update_migrations WHERE version = ?')
      .get(CURRENT_MIGRATION_VERSION)) return
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE marketplace_updates (
          update_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_marketplace_updates_state ON marketplace_updates(state, updated_at);
      `)
      this.db.prepare('INSERT INTO marketplace_update_migrations (version, applied_at) VALUES (?, ?)')
        .run(CURRENT_MIGRATION_VERSION, this.clock().toISOString())
    })()
  }

  private begin(input: MarketplaceUpdateBeginRequest): MarketplaceUpdateRecord {
    const request = MarketplaceUpdateBeginRequestSchema.parse(input)
    const timestamp = this.clock().toISOString()
    const record = MarketplaceUpdateRecordSchema.parse({
      ...request,
      createdAt: timestamp,
      revision: 0,
      schemaVersion: 1,
      state: 'ready',
      updateId: this.idFactory(),
      updatedAt: timestamp,
    })
    try {
      this.db.prepare(`
        INSERT INTO marketplace_updates (update_id, state, revision, record_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(record.updateId, record.state, record.revision, JSON.stringify(record), record.updatedAt)
      return record
    } catch (error) {
      throw new Error('Marketplace update evidence already exists', { cause: error })
    }
  }

  private find(updateId: string): MarketplaceUpdateRecord | null {
    if (typeof updateId !== 'string' || !updateId) throw new Error('Marketplace update id is invalid')
    const row = this.db.prepare(`
      SELECT update_id, state, revision, record_json FROM marketplace_updates WHERE update_id = ?
    `).get(updateId) as UpdateRow | undefined
    return this.parse(row)
  }

  private listReady(): readonly MarketplaceUpdateRecord[] {
    return Object.freeze((this.db.prepare(`
      SELECT update_id, state, revision, record_json FROM marketplace_updates
      WHERE state = 'ready' ORDER BY updated_at, update_id
    `).all() as UpdateRow[]).map((row) => this.parse(row)!))
  }

  private transition(input: MarketplaceUpdateTransitionRequest): MarketplaceUpdateRecord {
    const request = MarketplaceUpdateTransitionRequestSchema.parse(input)
    return this.db.transaction(() => {
      const current = this.find(request.updateId)
      if (!current || current.state !== 'ready') throw new Error('Marketplace update is not ready')
      if (current.revision !== request.expectedRevision) throw new Error('Marketplace update revision is stale')
      const next = MarketplaceUpdateRecordSchema.parse({
        ...current,
        revision: current.revision + 1,
        state: request.state,
        updatedAt: this.clock().toISOString(),
      })
      const result = this.db.prepare(`
        UPDATE marketplace_updates SET state = ?, revision = ?, record_json = ?, updated_at = ?
        WHERE update_id = ? AND revision = ?
      `).run(next.state, next.revision, JSON.stringify(next), next.updatedAt, next.updateId, current.revision)
      if (result.changes !== 1) throw new Error('Marketplace update revision changed concurrently')
      return next
    })()
  }

  private parse(row: UpdateRow | undefined): MarketplaceUpdateRecord | null {
    if (!row) return null
    try {
      const record = MarketplaceUpdateRecordSchema.parse(JSON.parse(row.record_json) as unknown)
      if (record.updateId !== row.update_id || record.state !== row.state || record.revision !== row.revision) {
        throw new Error('Marketplace update row evidence mismatch')
      }
      return record
    } catch (error) {
      throw new Error('Invalid persisted Marketplace update record', { cause: error })
    }
  }
}
