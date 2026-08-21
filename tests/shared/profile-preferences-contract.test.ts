import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_PREFERENCES, ProfilePreferencesSchema } from '../../src/shared/profile-preferences'

describe('profile preferences contract', () => {
  it('accepts the owned local profile and rejects unexpected fields', () => {
    expect(ProfilePreferencesSchema.parse(DEFAULT_PROFILE_PREFERENCES).displayName).toBe('Pivot User')
    expect(() => ProfilePreferencesSchema.parse({ ...DEFAULT_PROFILE_PREFERENCES, role: 'admin' })).toThrow()
    expect(() => ProfilePreferencesSchema.parse({ ...DEFAULT_PROFILE_PREFERENCES, bio: 'x'.repeat(201) })).toThrow()
  })
})
