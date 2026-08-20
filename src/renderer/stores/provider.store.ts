import { create } from 'zustand'
import type { ProviderConfig, ProviderConfigInput, ProviderConnectionResult } from '../../shared/types/domain'
import { providerService } from '../services/provider.service'

export const PROVIDER_REMOVAL_UNDO_MS = 10_000

export interface PendingProviderRemoval {
  config: ProviderConfig
  expiresAt: number
}

interface ProviderStoreState {
  configs: ProviderConfig[]
  error: string | null
  isLoading: boolean
  pendingRemovals: Record<string, PendingProviderRemoval>
  testResults: Record<string, ProviderConnectionResult>
  load: () => Promise<void>
  remove: (id: string) => Promise<void>
  save: (input: ProviderConfigInput) => Promise<ProviderConfig | null>
  setActive: (id: string) => Promise<void>
  test: (id: string) => Promise<ProviderConnectionResult | null>
  undoRemove: (id: string) => void
}

const removalTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useProviderStore = create<ProviderStoreState>((set, get) => ({
  configs: [],
  error: null,
  isLoading: false,
  pendingRemovals: {},
  testResults: {},
  async load() {
    try {
      const configs = await providerService.list()
      set((state) => ({
        configs: configs.filter((provider) => !state.pendingRemovals[provider.id]),
        error: null,
      }))
    } catch (error) {
      set({ error: message(error, 'Failed to load providers') })
    }
  },
  async save(input) {
    const pendingTimer = removalTimers.get(input.id)
    try {
      const saved = await providerService.save(input)
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        removalTimers.delete(input.id)
      }
      set((state) => {
        const pendingRemovals = { ...state.pendingRemovals }
        delete pendingRemovals[saved.id]
        return {
          configs: [saved, ...state.configs.filter((provider) => provider.id !== saved.id)],
          error: null,
          pendingRemovals,
        }
      })
      return saved
    } catch (error) {
      set({ error: message(error, 'Failed to save provider') })
      return null
    }
  },
  async setActive(id) {
    try {
      const active = await providerService.setActive(id)
      set((state) => ({ configs: state.configs.map((provider) => ({ ...provider, isActive: provider.id === active.id })), error: null }))
    } catch (error) {
      set({ error: message(error, 'Failed to activate provider') })
    }
  },
  async test(id) {
    set({ isLoading: true })
    try {
      const result = await providerService.test(id)
      set((state) => ({ error: null, testResults: { ...state.testResults, [id]: result } }))
      return result
    } catch (error) {
      set({ error: message(error, 'Connection test failed') })
      return null
    } finally {
      set({ isLoading: false })
    }
  },
  async remove(id) {
    const config = get().configs.find((provider) => provider.id === id)
    if (!config) return
    if (config.isActive) {
      set({ error: 'Active provider cannot be deleted' })
      return
    }

    const existingTimer = removalTimers.get(id)
    if (existingTimer) clearTimeout(existingTimer)
    const expiresAt = Date.now() + PROVIDER_REMOVAL_UNDO_MS
    set((state) => ({
      configs: state.configs.filter((provider) => provider.id !== id),
      error: null,
      pendingRemovals: { ...state.pendingRemovals, [id]: { config, expiresAt } },
    }))

    const timer = setTimeout(() => {
      removalTimers.delete(id)
      void providerService.delete(id).then(() => {
        set((state) => {
          const pendingRemovals = { ...state.pendingRemovals }
          delete pendingRemovals[id]
          return { pendingRemovals }
        })
      }).catch((error) => {
        set((state) => {
          const pendingRemovals = { ...state.pendingRemovals }
          delete pendingRemovals[id]
          return {
            configs: state.configs.some((provider) => provider.id === id) ? state.configs : [config, ...state.configs],
            error: message(error, 'Failed to delete provider'),
            pendingRemovals,
          }
        })
      })
    }, PROVIDER_REMOVAL_UNDO_MS)
    removalTimers.set(id, timer)
  },
  undoRemove(id) {
    const pending = get().pendingRemovals[id]
    if (!pending) return
    const timer = removalTimers.get(id)
    if (timer) clearTimeout(timer)
    removalTimers.delete(id)
    set((state) => {
      const pendingRemovals = { ...state.pendingRemovals }
      delete pendingRemovals[id]
      return {
        configs: state.configs.some((provider) => provider.id === id) ? state.configs : [pending.config, ...state.configs],
        error: null,
        pendingRemovals,
      }
    })
  },
}))

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
