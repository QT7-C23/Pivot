import type { ProviderConfig, ProviderConfigInput, ProviderConnectionResult } from '../../shared/types/domain'
import type { ProviderModelProbeRequest, ProviderModelProbeResult } from '../../shared/provider-model-probe-contracts'

export const providerService = {
  list(): Promise<ProviderConfig[]> {
    return window.pivot.invoke('provider:list', undefined)
  },
  probeModels(request: ProviderModelProbeRequest): Promise<ProviderModelProbeResult> {
    return window.pivot.invoke('provider:probe-models', request)
  },
  save(input: ProviderConfigInput): Promise<ProviderConfig> {
    return window.pivot.invoke('provider:save', input)
  },
  setActive(id: string): Promise<ProviderConfig> {
    return window.pivot.invoke('provider:set-active', { id })
  },
  test(id: string): Promise<ProviderConnectionResult> {
    return window.pivot.invoke('provider:test', { id })
  },
  delete(id: string): Promise<void> {
    return window.pivot.invoke('provider:delete', { id })
  },
}
