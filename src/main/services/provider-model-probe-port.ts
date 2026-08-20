import type { ProviderConfig } from '../../shared/types/domain'

export interface ProviderModelProbePort {
  probe(provider: Readonly<ProviderConfig>, apiKey: string): Promise<Readonly<{
    models: readonly string[]
    truncated: boolean
  }>>
}
