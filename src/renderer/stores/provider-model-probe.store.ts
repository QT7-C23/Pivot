import { create } from 'zustand'
import type { ProviderModelProbeResult } from '../../shared/provider-model-probe-contracts'
import { providerService } from '../services/provider.service'

interface ProviderModelProbeState {
  errors: Record<string, string | undefined>
  loading: Record<string, boolean | undefined>
  results: Record<string, ProviderModelProbeResult | undefined>
  probe(providerId: string, forceRefresh: boolean): Promise<void>
}

const requestIds = new Map<string, number>()

export const useProviderModelProbeStore = create<ProviderModelProbeState>((set) => ({
  errors: {},
  loading: {},
  results: {},
  async probe(providerId, forceRefresh) {
    const requestId = (requestIds.get(providerId) ?? 0) + 1
    requestIds.set(providerId, requestId)
    set((state) => ({
      errors: { ...state.errors, [providerId]: undefined },
      loading: { ...state.loading, [providerId]: true },
    }))
    try {
      const response = await providerService.probeModels({ forceRefresh, providerId })
      const { ProviderModelProbeResultSchema } = await import('../../shared/provider-model-probe-contracts')
      const result = ProviderModelProbeResultSchema.parse(response)
      if (result.providerId !== providerId) throw new Error('Provider model probe owner does not match the request')
      if (requestIds.get(providerId) !== requestId) return
      set((state) => ({
        errors: { ...state.errors, [providerId]: undefined },
        loading: { ...state.loading, [providerId]: false },
        results: { ...state.results, [providerId]: result },
      }))
    } catch (error) {
      if (requestIds.get(providerId) !== requestId) return
      set((state) => {
        const results = { ...state.results }
        delete results[providerId]
        return {
          errors: { ...state.errors, [providerId]: error instanceof Error ? `Invalid model probe: ${error.message}` : 'Invalid model probe' },
          loading: { ...state.loading, [providerId]: false },
          results,
        }
      })
    }
  },
}))
