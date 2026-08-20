import Database from 'better-sqlite3'
import type { ProviderConfig, ProviderConfigInput, ProviderKind } from '../../shared/types/domain'
import { validateAndNormalizeProviderEndpoint } from './provider-trust-policy'

export interface SecretCipher {
  decrypt: (ciphertext: string) => string
  encrypt: (plaintext: string) => string
}

interface ProviderRow {
  base_url: string
  encrypted_key: string | null
  id: string
  is_active: number
  kind: ProviderKind
  label: string
  model: string
  updated_at: string
}

export class ProviderStore {
  private readonly db: Database

  constructor(private readonly cipher: SecretCipher, databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        encrypted_key TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `)
  }

  list(): ProviderConfig[] {
    return (this.db.prepare('SELECT * FROM provider_configs ORDER BY label').all() as ProviderRow[]).map(toConfig)
  }

  get(id: string): ProviderConfig | null {
    const row = this.getRow(id)
    return row ? toConfig(row) : null
  }

  save(input: ProviderConfigInput): ProviderConfig {
    const baseUrl = validateProviderInput(input)
    const existing = this.getRow(input.id)
    if (existing && existing.base_url !== baseUrl && !input.apiKey?.trim()) {
      throw new Error('Changing a provider endpoint requires a new API key')
    }
    const encryptedKey = input.apiKey?.trim()
      ? this.cipher.encrypt(input.apiKey.trim())
      : existing?.encrypted_key ?? null
    const updatedAt = new Date().toISOString()
    this.db.prepare(`INSERT INTO provider_configs (id, kind, label, base_url, model, encrypted_key, is_active, updated_at)
      VALUES (@id, @kind, @label, @baseUrl, @model, @encryptedKey, @isActive, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, label = excluded.label, base_url = excluded.base_url,
        model = excluded.model, encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at`)
      .run({ ...input, baseUrl, encryptedKey, isActive: existing?.is_active ?? 0, updatedAt })
    return this.get(input.id)!
  }

  setActive(id: string): ProviderConfig {
    const provider = this.getRow(id)
    if (!provider) throw new Error(`Provider not found: ${id}`)
    if (!provider.encrypted_key) throw new Error('Configure an API key before activating this provider')
    const transaction = this.db.prepare('UPDATE provider_configs SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END')
    transaction.run(id)
    return this.get(id)!
  }

  delete(id: string): void {
    const provider = this.getRow(id)
    if (provider?.is_active === 1) throw new Error('Active provider cannot be deleted')
    this.db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id)
  }

  readSecret(id: string): string {
    const row = this.getRow(id)
    if (!row?.encrypted_key) throw new Error('Provider API key is not configured')
    return this.cipher.decrypt(row.encrypted_key)
  }

  close(): void {
    this.db.close()
  }

  private getRow(id: string): ProviderRow | null {
    return (this.db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as ProviderRow | undefined) ?? null
  }
}

function toConfig(row: ProviderRow): ProviderConfig {
  return {
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.encrypted_key),
    id: row.id,
    isActive: row.is_active === 1,
    kind: row.kind,
    label: row.label,
    model: row.model,
    updatedAt: row.updated_at,
  }
}

function validateProviderInput(input: ProviderConfigInput): string {
  if (!input.id.trim() || !input.label.trim() || !input.model.trim()) throw new Error('Provider id, label, and model are required')
  return validateAndNormalizeProviderEndpoint(input.kind, input.baseUrl)
}
