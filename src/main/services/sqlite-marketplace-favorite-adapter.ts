import Database from 'better-sqlite3'
import {
  MarketplaceFavoriteCollectionSchema,
  MarketplaceFavoriteSetRequestSchema,
  type MarketplaceFavorite,
  type MarketplaceFavoriteCollection,
  type MarketplaceFavoriteSetRequest,
  type MarketplaceResourceKind,
} from '../../shared/marketplace-contracts'
import type {
  MarketplaceFavoriteReaderPort,
  MarketplaceFavoriteWriterPort,
} from './marketplace-ports'

interface FavoriteStateRow {
  revision: number
  schema_version: number
  updated_at: string
}

interface FavoriteRow {
  created_at: string
  kind: string
  resource_id: string
  source_id: string
}

const CURRENT_MIGRATION_VERSION = 1

export class MarketplaceFavoriteRevisionConflictError extends Error {
  constructor(expectedRevision: number, actualRevision: number) {
    super(`Marketplace favorites revision conflict: expected ${expectedRevision}, actual ${actualRevision}`)
    this.name = 'MarketplaceFavoriteRevisionConflictError'
  }
}

export class SqliteMarketplaceFavoriteAdapter {
  private readonly db: Database
  private readonly now: () => string

  constructor(options: { databasePath?: string; now?: () => string } = {}) {
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.now = options.now ?? (() => new Date().toISOString())
    this.migrate()
  }

  openReaderPort(): MarketplaceFavoriteReaderPort {
    return Object.freeze({ getFavorites: () => this.read() })
  }

  openWriterPort(): MarketplaceFavoriteWriterPort {
    return Object.freeze({
      setFavorite: (request: MarketplaceFavoriteSetRequest) => this.setFavorite(request),
    })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_favorite_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = new Set(
      (this.db.prepare('SELECT version FROM marketplace_favorite_migrations').all() as Array<{ version: number }>)
        .map(({ version }) => version),
    )
    if (applied.has(CURRENT_MIGRATION_VERSION)) return

    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE marketplace_favorite_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema_version INTEGER NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE marketplace_favorites (
          source_id TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (source_id, kind, resource_id)
        );
      `)
      const appliedAt = this.now()
      this.db.prepare(`
        INSERT INTO marketplace_favorite_state (id, schema_version, revision, updated_at)
        VALUES (1, 1, 0, ?)
      `).run(appliedAt)
      this.db.prepare(`
        INSERT INTO marketplace_favorite_migrations (version, applied_at)
        VALUES (?, ?)
      `).run(CURRENT_MIGRATION_VERSION, appliedAt)
    })()
  }

  private read(): MarketplaceFavoriteCollection {
    const state = this.db.prepare(`
      SELECT schema_version, revision, updated_at
      FROM marketplace_favorite_state WHERE id = 1
    `).get() as FavoriteStateRow | undefined
    const rows = this.db.prepare(`
      SELECT source_id, resource_id, kind, created_at
      FROM marketplace_favorites
      ORDER BY source_id ASC, kind ASC, resource_id ASC
    `).all() as FavoriteRow[]

    try {
      if (!state) throw new Error('Marketplace favorite state row is missing')
      return MarketplaceFavoriteCollectionSchema.parse({
        items: rows.map(parseFavoriteRow),
        revision: state.revision,
        schemaVersion: state.schema_version,
        updatedAt: state.updated_at,
      })
    } catch (error) {
      throw new Error('Invalid persisted marketplace favorites', { cause: error })
    }
  }

  private setFavorite(input: MarketplaceFavoriteSetRequest): MarketplaceFavoriteCollection {
    const request = MarketplaceFavoriteSetRequestSchema.parse(input)
    return this.db.transaction(() => {
      const current = this.read()
      if (current.revision !== request.expectedRevision) {
        throw new MarketplaceFavoriteRevisionConflictError(request.expectedRevision, current.revision)
      }

      const exists = current.items.some((item) => sameFavorite(item, request))
      if (exists === request.favorite) return current

      const timestamp = this.now()
      if (request.favorite) {
        this.db.prepare(`
          INSERT INTO marketplace_favorites (source_id, resource_id, kind, created_at)
          VALUES (?, ?, ?, ?)
        `).run(request.sourceId, request.resourceId, request.kind, timestamp)
      } else {
        const result = this.db.prepare(`
          DELETE FROM marketplace_favorites
          WHERE source_id = ? AND resource_id = ? AND kind = ?
        `).run(request.sourceId, request.resourceId, request.kind)
        if (result.changes !== 1) throw new Error('Marketplace favorite changed during removal')
      }

      const result = this.db.prepare(`
        UPDATE marketplace_favorite_state
        SET revision = revision + 1, updated_at = ?
        WHERE id = 1 AND revision = ?
      `).run(timestamp, request.expectedRevision)
      if (result.changes !== 1) {
        throw new MarketplaceFavoriteRevisionConflictError(
          request.expectedRevision,
          this.read().revision,
        )
      }
      return this.read()
    })()
  }
}

function parseFavoriteRow(row: FavoriteRow): MarketplaceFavorite {
  return {
    createdAt: row.created_at,
    kind: row.kind as MarketplaceResourceKind,
    resourceId: row.resource_id,
    sourceId: row.source_id,
  }
}

function sameFavorite(
  item: MarketplaceFavorite,
  request: MarketplaceFavoriteSetRequest,
): boolean {
  return item.sourceId === request.sourceId
    && item.resourceId === request.resourceId
    && item.kind === request.kind
}
