import Database from 'better-sqlite3'
import {
  ApplicationPreferencesSchema,
  ApplicationPreferenceValuesSchema,
  ApplicationPreferencesUpdateRequestSchema,
  DEFAULT_APPLICATION_PREFERENCE_VALUES,
  type ApplicationPreferences,
  type ApplicationPreferencesUpdateRequest,
} from '../../shared/application-preferences'
import type {
  ApplicationPreferencesReaderPort,
  ApplicationPreferencesWriterPort,
} from './application-preferences-ports'

interface PreferenceRow {
  revision: number
  schema_version: number
  updated_at: string
  value_json: string
}

const CURRENT_MIGRATION_VERSION = 2
const ApplicationPreferenceValuesV1Schema = ApplicationPreferenceValuesSchema.omit({ theme: true })

export class ApplicationPreferencesRevisionConflictError extends Error {
  constructor(expectedRevision: number, actualRevision: number) {
    super(`Application preferences revision conflict: expected ${expectedRevision}, actual ${actualRevision}`)
    this.name = 'ApplicationPreferencesRevisionConflictError'
  }
}

export class SqliteApplicationPreferencesAdapter {
  private readonly db: Database
  private readonly now: () => string

  constructor(options: { databasePath?: string; now?: () => string } = {}) {
    this.db = new Database(options.databasePath ?? ':memory:')
    this.db.pragma('journal_mode = WAL')
    this.now = options.now ?? (() => new Date().toISOString())
    this.migrate()
  }

  openReaderPort(): ApplicationPreferencesReaderPort {
    return Object.freeze({ get: () => this.read() })
  }

  openWriterPort(): ApplicationPreferencesWriterPort {
    return Object.freeze({
      update: (request: ApplicationPreferencesUpdateRequest) => this.update(request),
    })
  }

  close(): void {
    this.db.close()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS application_preferences_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)
    const applied = new Set(
      (this.db.prepare('SELECT version FROM application_preferences_migrations').all() as Array<{ version: number }>)
        .map(({ version }) => version),
    )
    if (!applied.has(1)) {
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE application_preferences (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            schema_version INTEGER NOT NULL,
            revision INTEGER NOT NULL CHECK (revision >= 0),
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `)
        const updatedAt = this.now()
        const { theme: _theme, ...legacyDefaults } = DEFAULT_APPLICATION_PREFERENCE_VALUES
        this.db.prepare(`
          INSERT INTO application_preferences (
            id, schema_version, revision, value_json, updated_at
          ) VALUES (1, 1, 0, ?, ?)
        `).run(JSON.stringify(legacyDefaults), updatedAt)
        this.db.prepare(`
          INSERT INTO application_preferences_migrations (version, applied_at)
          VALUES (?, ?)
        `).run(1, updatedAt)
      })()
      applied.add(1)
    }
    if (!applied.has(CURRENT_MIGRATION_VERSION)) {
      this.db.transaction(() => {
        const row = this.db.prepare(`
          SELECT value_json FROM application_preferences WHERE id = 1
        `).get() as Pick<PreferenceRow, 'value_json'> | undefined
        if (!row) throw new Error('Application preferences row is missing during migration')
        const legacyValues = ApplicationPreferenceValuesV1Schema.parse(JSON.parse(row.value_json) as unknown)
        const updatedAt = this.now()
        this.db.prepare(`
          UPDATE application_preferences
          SET schema_version = 2, value_json = ?, updated_at = ?
          WHERE id = 1
        `).run(JSON.stringify({ ...legacyValues, theme: 'light' }), updatedAt)
        this.db.prepare(`
          INSERT INTO application_preferences_migrations (version, applied_at)
          VALUES (?, ?)
        `).run(CURRENT_MIGRATION_VERSION, updatedAt)
      })()
    }
  }

  private read(): ApplicationPreferences {
    const row = this.db.prepare(`
      SELECT schema_version, revision, value_json, updated_at
      FROM application_preferences WHERE id = 1
    `).get() as PreferenceRow | undefined
    if (!row) throw new Error('Application preferences row is missing')
    try {
      return ApplicationPreferencesSchema.parse({
        revision: row.revision,
        schemaVersion: row.schema_version,
        updatedAt: row.updated_at,
        values: JSON.parse(row.value_json) as unknown,
      })
    } catch (error) {
      throw new Error('Invalid persisted application preferences', { cause: error })
    }
  }

  private update(input: unknown): ApplicationPreferences {
    const request = ApplicationPreferencesUpdateRequestSchema.parse(input)
    return this.db.transaction(() => {
      const current = this.read()
      if (current.revision !== request.expectedRevision) {
        throw new ApplicationPreferencesRevisionConflictError(
          request.expectedRevision,
          current.revision,
        )
      }
      const next = ApplicationPreferencesSchema.parse({
        revision: current.revision + 1,
        schemaVersion: 2,
        updatedAt: this.now(),
        values: { ...current.values, ...request.patch },
      })
      const result = this.db.prepare(`
        UPDATE application_preferences
        SET schema_version = ?, revision = ?, value_json = ?, updated_at = ?
        WHERE id = 1 AND revision = ?
      `).run(
        next.schemaVersion,
        next.revision,
        JSON.stringify(next.values),
        next.updatedAt,
        request.expectedRevision,
      )
      if (result.changes !== 1) {
        throw new ApplicationPreferencesRevisionConflictError(
          request.expectedRevision,
          this.read().revision,
        )
      }
      return next
    })()
  }
}
