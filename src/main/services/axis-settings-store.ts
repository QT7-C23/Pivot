import Database from 'better-sqlite3'

interface SettingRow {
  value: string
}

const SHADOW_ENABLED_KEY = 'axis.shadowEnabled'
const DRY_RUN_ENABLED_KEY = 'axis.dryRunEnabled'
const REAL_EXECUTION_ENABLED_KEY = 'axis.realExecutionEnabled'

export class AxisSettingsStore {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  isShadowEnabled(): boolean {
    return this.readBoolean(SHADOW_ENABLED_KEY)
  }

  setShadowEnabled(enabled: boolean): void {
    this.writeBoolean(SHADOW_ENABLED_KEY, enabled)
  }

  isDryRunEnabled(): boolean {
    return this.readBoolean(DRY_RUN_ENABLED_KEY)
  }

  setDryRunEnabled(enabled: boolean): void {
    this.writeBoolean(DRY_RUN_ENABLED_KEY, enabled)
  }

  isRealExecutionEnabled(): boolean {
    return this.readBoolean(REAL_EXECUTION_ENABLED_KEY)
  }

  setRealExecutionEnabled(enabled: boolean): void {
    this.writeBoolean(REAL_EXECUTION_ENABLED_KEY, enabled)
  }

  private readBoolean(key: string): boolean {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as SettingRow | undefined
    return row?.value === 'true'
  }

  private writeBoolean(key: string, enabled: boolean): void {
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(enabled), new Date().toISOString())
  }

  close(): void {
    this.db.close()
  }
}
