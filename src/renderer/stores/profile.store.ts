import { create } from 'zustand'
import { DEFAULT_PROFILE_PREFERENCES, ProfilePreferencesSchema, type ProfilePreferences } from '../../shared/profile-preferences'

const STORAGE_KEY = 'pivot:profile-preferences:v1'

interface ProfileStore {
  preferences: ProfilePreferences
  load(): void
  save(next: ProfilePreferences): void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  preferences: DEFAULT_PROFILE_PREFERENCES,
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) set({ preferences: ProfilePreferencesSchema.parse(JSON.parse(raw) as unknown) })
    } catch {
      set({ preferences: DEFAULT_PROFILE_PREFERENCES })
    }
  },
  save(input) {
    const preferences = ProfilePreferencesSchema.parse(input)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    set({ preferences })
  },
}))
