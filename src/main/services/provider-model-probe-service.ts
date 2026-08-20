import {
  ProviderModelProbeResultSchema,
  type ProviderModelProbeRequest,
  type ProviderModelProbeResult,
} from '../../shared/provider-model-probe-contracts'
import type { ProviderConfig } from '../../shared/types/domain'
import type { ProviderModelProbePort } from './provider-model-probe-port'

export interface ProviderModelProbeConfigurationPort {
  get(id: string): ProviderConfig | null
  readSecret(id: string): string
}

interface CacheEntry {
  expiresAtMs: number
  models: readonly string[]
  probedAtMs: number
  providerRevision: string
  truncated: boolean
}

export class ProviderModelProbeService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly clock: () => number
  private readonly configuration: ProviderModelProbeConfigurationPort
  private readonly inFlight = new Map<string, Promise<ProviderModelProbeResult>>()
  private readonly probe: ProviderModelProbePort
  private readonly ttlMs: number

  constructor(options: {
    clock?: () => number
    configuration: ProviderModelProbeConfigurationPort
    probe: ProviderModelProbePort
    ttlMs?: number
  }) {
    this.clock = options.clock ?? Date.now
    this.configuration = options.configuration
    this.probe = options.probe
    this.ttlMs = options.ttlMs ?? 5 * 60_000
    if (!Number.isInteger(this.ttlMs) || this.ttlMs < 1 || this.ttlMs > 24 * 60 * 60_000) {
      throw new Error('Provider model probe TTL must be between 1 ms and 24 hours')
    }
  }

  async query(request: ProviderModelProbeRequest): Promise<ProviderModelProbeResult> {
    const provider = this.configuration.get(request.providerId)
    if (!provider?.hasApiKey) return unavailable(request.providerId, 'not-configured')
    const now = this.clock()
    const cached = this.cache.get(provider.id)
    const validRevision = cached?.providerRevision === provider.updatedAt
    if (!request.forceRefresh && cached && validRevision && cached.expiresAtMs > now) {
      return project(provider.id, cached, 'hit')
    }
    const key = `${provider.id}:${provider.updatedAt}`
    const existing = this.inFlight.get(key)
    if (existing) return existing
    const pending = this.refresh(provider, cached && validRevision ? cached : undefined)
    this.inFlight.set(key, pending)
    try { return await pending }
    finally { if (this.inFlight.get(key) === pending) this.inFlight.delete(key) }
  }

  private async refresh(provider: ProviderConfig, stale?: CacheEntry): Promise<ProviderModelProbeResult> {
    try {
      const value = await this.probe.probe(provider, this.configuration.readSecret(provider.id))
      const now = this.clock()
      const entry: CacheEntry = Object.freeze({
        expiresAtMs: now + this.ttlMs,
        models: Object.freeze([...value.models]),
        probedAtMs: now,
        providerRevision: provider.updatedAt,
        truncated: value.truncated,
      })
      this.cache.set(provider.id, entry)
      return project(provider.id, entry, 'refreshed')
    } catch {
      return stale ? project(provider.id, stale, 'stale') : unavailable(provider.id, 'probe-failed')
    }
  }
}

function project(providerId: string, entry: CacheEntry, cacheState: 'hit' | 'refreshed' | 'stale'): ProviderModelProbeResult {
  return ProviderModelProbeResultSchema.parse({
    available: true,
    cacheState,
    expiresAt: new Date(entry.expiresAtMs).toISOString(),
    models: entry.models,
    probedAt: new Date(entry.probedAtMs).toISOString(),
    providerId,
    schemaVersion: 1,
    truncated: entry.truncated,
    unavailableReason: null,
  })
}

function unavailable(providerId: string, unavailableReason: 'not-configured' | 'probe-failed'): ProviderModelProbeResult {
  return ProviderModelProbeResultSchema.parse({
    available: false,
    cacheState: 'none',
    expiresAt: null,
    models: [],
    probedAt: null,
    providerId,
    schemaVersion: 1,
    truncated: false,
    unavailableReason,
  })
}
