import Database from 'better-sqlite3'
import {
  MarketplaceCatalogPayloadSchema,
  MarketplaceCatalogSnapshotSchema,
  serializeMarketplaceCatalogPayload,
  type MarketplaceCatalogSnapshot,
} from '../../shared/marketplace-contracts'
import type {
  MarketplaceCatalogCachePort,
  MarketplaceCatalogCacheReaderPort,
  MarketplaceCatalogCacheWriterPort,
} from './marketplace-catalog-ports'

interface CatalogCacheRow {
  revision: number
  snapshot_json: string
  source_id: string
}

const CURRENT_MIGRATION_VERSION = 1
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/

export class SqliteMarketplaceCatalogCacheAdapter {
  private readonly db: Database
  private readonly now: () => string

  constructor(options: { databasePath?: string; now?: () => string } = {}) {
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.now = options.now ?? (() => new Date().toISOString())
    this.migrate()
  }

  openReaderPort(): MarketplaceCatalogCacheReaderPort {
    return Object.freeze({ read: (sourceId: string) => this.read(sourceId) })
  }

  openWriterPort(): MarketplaceCatalogCacheWriterPort {
    return Object.freeze({ write: (snapshot: MarketplaceCatalogSnapshot) => this.write(snapshot) })
  }

  openPort(): MarketplaceCatalogCachePort {
    return Object.freeze({
      read: (sourceId: string) => this.read(sourceId),
      write: (snapshot: MarketplaceCatalogSnapshot) => this.write(snapshot),
    })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_catalog_cache_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = new Set(
      (this.db.prepare('SELECT version FROM marketplace_catalog_cache_migrations').all() as Array<{ version: number }>)
        .map(({ version }) => version),
    )
    if (applied.has(CURRENT_MIGRATION_VERSION)) return
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE marketplace_catalog_cache (
          source_id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          snapshot_json TEXT NOT NULL,
          cached_at TEXT NOT NULL
        );
      `)
      this.db.prepare(`
        INSERT INTO marketplace_catalog_cache_migrations (version, applied_at)
        VALUES (?, ?)
      `).run(CURRENT_MIGRATION_VERSION, this.now())
    })()
  }

  private read(sourceIdInput: string): MarketplaceCatalogSnapshot | null {
    const sourceId = requireSourceId(sourceIdInput)
    const row = this.db.prepare(`
      SELECT source_id, revision, snapshot_json
      FROM marketplace_catalog_cache WHERE source_id = ?
    `).get(sourceId) as CatalogCacheRow | undefined
    if (!row) return null
    try {
      const snapshot = MarketplaceCatalogSnapshotSchema.parse(JSON.parse(row.snapshot_json) as unknown)
      if (snapshot.source.id !== row.source_id || snapshot.revision !== row.revision) {
        throw new Error('Marketplace Catalog cache row identity mismatch')
      }
      return snapshot
    } catch (error) {
      throw new Error('Invalid persisted Marketplace Catalog', { cause: error })
    }
  }

  private write(snapshotInput: MarketplaceCatalogSnapshot): void {
    const snapshot = MarketplaceCatalogSnapshotSchema.parse(snapshotInput)
    this.db.transaction(() => {
      const current = this.read(snapshot.source.id)
      if (current && snapshot.revision < current.revision) {
        throw new Error(`Marketplace Catalog cache revision rollback: ${snapshot.revision} < ${current.revision}`)
      }
      if (
        current
        && snapshot.revision === current.revision
        && serializeMarketplaceCatalogPayload(payloadOf(snapshot))
          !== serializeMarketplaceCatalogPayload(payloadOf(current))
      ) {
        throw new Error(`Marketplace Catalog cache revision equivocation: ${snapshot.revision}`)
      }
      this.db.prepare(`
        INSERT INTO marketplace_catalog_cache (
          source_id, revision, snapshot_json, cached_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          revision = excluded.revision,
          snapshot_json = excluded.snapshot_json,
          cached_at = excluded.cached_at
      `).run(
        snapshot.source.id,
        snapshot.revision,
        JSON.stringify(snapshot),
        this.now(),
      )
    })()
  }
}

function payloadOf(snapshot: MarketplaceCatalogSnapshot): unknown {
  return MarketplaceCatalogPayloadSchema.parse({
    entries: snapshot.entries,
    expiresAt: snapshot.expiresAt,
    generatedAt: snapshot.generatedAt,
    revision: snapshot.revision,
    schemaVersion: snapshot.schemaVersion,
    source: snapshot.source,
  })
}

function requireSourceId(input: string): string {
  if (typeof input !== 'string' || !SOURCE_ID_PATTERN.test(input)) {
    throw new Error('Invalid Marketplace Catalog source identifier')
  }
  return input
}
