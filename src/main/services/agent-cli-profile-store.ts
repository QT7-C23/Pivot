import Database from 'better-sqlite3'
import type { AgentCliCustomProfileConfig, AgentCliProfileId } from '../../shared/types/domain'

interface SettingRow {
  value: string
}

const SELECTED_PROFILE_KEY = 'agent.selectedProfileId'
const CUSTOM_PROFILE_CONFIG_KEY = 'agent.customProfileConfig'

export class AgentCliProfileStore {
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

  getSelectedProfileId(): AgentCliProfileId | null {
    const row = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(SELECTED_PROFILE_KEY) as SettingRow | undefined

    return isProfileId(row?.value) ? row.value : null
  }

  setSelectedProfileId(profileId: AgentCliProfileId): void {
    this.setSetting(SELECTED_PROFILE_KEY, profileId)
  }

  getCustomProfileConfig(): AgentCliCustomProfileConfig | null {
    const row = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(CUSTOM_PROFILE_CONFIG_KEY) as SettingRow | undefined

    if (!row) {
      return null
    }

    try {
      const parsed = JSON.parse(row.value) as unknown
      return isCustomProfileConfig(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  setCustomProfileConfig(config: AgentCliCustomProfileConfig): void {
    this.setSetting(CUSTOM_PROFILE_CONFIG_KEY, JSON.stringify(config))
  }

  close(): void {
    this.db.close()
  }

  private setSetting(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value, new Date().toISOString())
  }
}

function isProfileId(value: unknown): value is AgentCliProfileId {
  return value === 'local' || value === 'codex' || value === 'claude' || value === 'custom'
}

function isCustomProfileConfig(value: unknown): value is AgentCliCustomProfileConfig {
  if (!value || typeof value !== 'object') {
    return false
  }

  const config = value as Partial<AgentCliCustomProfileConfig>
  return (
    isOptionalString(config.adapterCommand) &&
    Array.isArray(config.adapterArgs) &&
    config.adapterArgs.every((item) => typeof item === 'string') &&
    isOptionalCommandSpec(config.versionCommand) &&
    isOptionalCommandSpec(config.updateCommand)
  )
}

function isOptionalCommandSpec(value: unknown): boolean {
  if (value === undefined) {
    return true
  }
  if (!value || typeof value !== 'object') {
    return false
  }

  const spec = value as { args?: unknown; command?: unknown }
  return (
    typeof spec.command === 'string' &&
    Array.isArray(spec.args) &&
    spec.args.every((item) => typeof item === 'string')
  )
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}
