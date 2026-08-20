import type Database from 'better-sqlite3'

const VERSION = 1
const QUALIFICATION_COLUMNS = ['evidence_id', 'provider_id', 'model_id', 'provider_revision', 'evidence_json']
const ROUTING_COLUMNS = ['singleton', 'revision', 'config_json']

export function migrateAxisReviewerSettings(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS axis_reviewer_settings_migrations (
    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
  );`)
  const applied = db.prepare('SELECT version FROM axis_reviewer_settings_migrations WHERE version=?').get(VERSION)
  if (applied) return
  db.transaction(() => {
    preserveMalformedTable(db, 'axis_reviewer_qualifications', QUALIFICATION_COLUMNS)
    preserveMalformedTable(db, 'axis_reviewer_routing', ROUTING_COLUMNS)
    db.exec(`CREATE TABLE IF NOT EXISTS axis_reviewer_qualifications (
      evidence_id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
      provider_revision TEXT NOT NULL, evidence_json TEXT NOT NULL,
      UNIQUE(provider_id, model_id, provider_revision)
    );
    CREATE TABLE IF NOT EXISTS axis_reviewer_routing (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL, config_json TEXT NOT NULL
    );`)
    db.prepare('INSERT INTO axis_reviewer_settings_migrations(version, applied_at) VALUES (?, ?)')
      .run(VERSION, new Date().toISOString())
  })()
}

function preserveMalformedTable(db: Database, table: string, expectedColumns: readonly string[]): void {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
  if (!exists) return
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name)
  if (expectedColumns.every((column) => columns.includes(column))) return
  const backup = `${table}_legacy_v0`
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(backup)) {
    throw new Error(`Cannot recover malformed ${table}: ${backup} already exists`)
  }
  db.exec(`ALTER TABLE ${table} RENAME TO ${backup}`)
}
