import { z } from 'zod'

export const ProfilePreferencesSchema = z.object({
  bio: z.string().max(200),
  displayName: z.string().trim().min(1).max(80),
  email: z.string().email().or(z.literal('')),
}).strict()

export type ProfilePreferences = z.infer<typeof ProfilePreferencesSchema>

export const DEFAULT_PROFILE_PREFERENCES: Readonly<ProfilePreferences> = Object.freeze({
  bio: '',
  displayName: 'Pivot User',
  email: '',
})
