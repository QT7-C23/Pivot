import { create } from 'zustand'
import {
  ApplicationPreferencesSchema,
  ApplicationPreferencesUpdateRequestSchema,
  type ApplicationPreferenceValues,
  type ApplicationPreferences,
} from '../../shared/application-preferences'
import { createApplicationPreferencesClient } from '../services/application-preferences-client'

interface ApplicationPreferencesStore {
  error: string | null
  isLoading: boolean
  preferences: ApplicationPreferences | null
  load(): Promise<ApplicationPreferences | null>
  update(patch: Partial<ApplicationPreferenceValues>): Promise<ApplicationPreferences | null>
}

const client = createApplicationPreferencesClient()

export const useApplicationPreferencesStore = create<ApplicationPreferencesStore>((set, get) => ({
  error: null,
  isLoading: false,
  preferences: null,
  async load() {
    set({ error: null, isLoading: true })
    try {
      const preferences = ApplicationPreferencesSchema.parse(await client.get())
      set({ isLoading: false, preferences })
      return preferences
    } catch (error) {
      set({ error: toMessage(error), isLoading: false })
      return null
    }
  },
  async update(patch) {
    const current = get().preferences
    if (!current || get().isLoading) return null
    set({ error: null, isLoading: true })
    try {
      const request = ApplicationPreferencesUpdateRequestSchema.parse({
        expectedRevision: current.revision,
        patch,
      })
      const preferences = ApplicationPreferencesSchema.parse(await client.update(request))
      set({ isLoading: false, preferences })
      return preferences
    } catch (error) {
      try {
        const preferences = ApplicationPreferencesSchema.parse(await client.get())
        set({ error: toMessage(error), isLoading: false, preferences })
      } catch (reloadError) {
        set({ error: `${toMessage(error)}; reload failed: ${toMessage(reloadError)}`, isLoading: false })
      }
      return null
    }
  },
}))

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
