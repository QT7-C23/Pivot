import { describe, expect, it } from 'vitest'
import {
  ApplicationPreferencesSchema,
  ApplicationPreferencesUpdateRequestSchema,
  DEFAULT_APPLICATION_PREFERENCE_VALUES,
} from '../../src/shared/application-preferences'

describe('application preferences shared contract', () => {
  it('accepts the exact Figma General and Appearance preference vocabulary', () => {
    expect(ApplicationPreferencesSchema.parse({
      revision: 0,
      schemaVersion: 2,
      updatedAt: '2026-08-02T00:00:00.000Z',
      values: DEFAULT_APPLICATION_PREFERENCE_VALUES,
    }).values).toEqual(DEFAULT_APPLICATION_PREFERENCE_VALUES)
    expect(DEFAULT_APPLICATION_PREFERENCE_VALUES.theme).toBe('light')
  })

  it('rejects unknown, empty and malformed updates at runtime', () => {
    expect(() => ApplicationPreferencesUpdateRequestSchema.parse({
      expectedRevision: 0,
      patch: {},
    })).toThrow()
    expect(() => ApplicationPreferencesUpdateRequestSchema.parse({
      expectedRevision: 0,
      patch: { startMinimized: true, projectRoot: 'D:\\forged' },
    })).toThrow()
    expect(() => ApplicationPreferencesUpdateRequestSchema.parse({
      expectedRevision: 0,
      patch: { notificationLevel: 'everything' },
    })).toThrow()
    expect(() => ApplicationPreferencesUpdateRequestSchema.parse({
      expectedRevision: -1,
      patch: { restoreSessions: false },
    })).toThrow()
    expect(() => ApplicationPreferencesUpdateRequestSchema.parse({
      expectedRevision: 0,
      patch: { theme: 'sepia' },
    })).toThrow()
  })

  it('rejects unknown persisted fields instead of silently accepting drift', () => {
    expect(() => ApplicationPreferencesSchema.parse({
      revision: 0,
      schemaVersion: 2,
      updatedAt: '2026-08-02T00:00:00.000Z',
      values: { ...DEFAULT_APPLICATION_PREFERENCE_VALUES, density: 'compact' },
    })).toThrow()
  })
})
