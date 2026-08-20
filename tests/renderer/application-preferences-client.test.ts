import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APPLICATION_PREFERENCE_VALUES } from '../../src/shared/application-preferences'
import { createApplicationPreferencesClient } from '../../src/renderer/services/application-preferences-client'

const persisted = {
  revision: 2,
  schemaVersion: 2 as const,
  updatedAt: '2026-08-02T00:00:00.000Z',
  values: { ...DEFAULT_APPLICATION_PREFERENCE_VALUES },
}

describe('Renderer application preferences client', () => {
  it('uses only the typed preload channels and validates responses', async () => {
    const invoke = vi.fn(async () => persisted)
    const client = createApplicationPreferencesClient(invoke)
    await expect(client.get()).resolves.toEqual(persisted)
    await expect(client.update({
      expectedRevision: 2,
      patch: { notificationLevel: 'none' },
    })).resolves.toEqual(persisted)
    expect(invoke).toHaveBeenNthCalledWith(1, 'settings:application-preferences', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'settings:update-application-preferences', {
      expectedRevision: 2,
      patch: { notificationLevel: 'none' },
    })
  })

  it('fails closed on malformed Main responses', async () => {
    const client = createApplicationPreferencesClient(async () => ({
      ...persisted,
      values: { ...persisted.values, projectRoot: 'D:\\forged' },
    }))
    await expect(client.get()).rejects.toThrow()
  })
})
