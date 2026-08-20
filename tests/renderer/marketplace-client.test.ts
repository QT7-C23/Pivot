import { describe, expect, it, vi } from 'vitest'
import { createMarketplaceClient } from '../../src/renderer/services/marketplace-client'

const identity = { kind: 'theme' as const, resourceId: 'pivot.dark', schemaVersion: 1 as const, sourceId: 'official', version: '1.0.0' }
const installations = { items: [{ capabilities: [], identity, revision: 1, state: 'installed' as const }], schemaVersion: 1 as const }

const favorites = {
  items: [],
  revision: 0,
  schemaVersion: 1 as const,
  updatedAt: '2026-08-17T00:00:00.000Z',
}

describe('Renderer Marketplace client', () => {
  it('uses only the narrow preload channels and validates both directions', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'marketplace:catalog') return { reason: 'unconfigured', status: 'unavailable' }
      if (channel === 'marketplace:installations' || channel === 'marketplace:uninstall') return installations
      if (channel === 'marketplace:install') return { installation: installations.items[0], status: 'installed' }
      if (channel === 'marketplace:activate') return { activatedAt: '2026-08-21T00:00:00.000Z', capabilities: [], identity, installationRevision: 1, registrationId: 'registration-1', revision: 0, schemaVersion: 1, state: 'active' }
      if (channel === 'marketplace:active-resources' || channel === 'marketplace:deactivate') return { items: [], schemaVersion: 1 }
      if (channel === 'marketplace:invoke-plugin') return { emittedCodes: [], resultCode: 0, schemaVersion: 1 }
      if (channel === 'marketplace:activate') return { activatedAt: '2026-08-21T00:00:00.000Z', capabilities: [], identity, installationRevision: 1, registrationId: 'registration-1', revision: 0, schemaVersion: 1, state: 'active' }
      if (channel === 'marketplace:active-resources' || channel === 'marketplace:deactivate') return { items: [], schemaVersion: 1 }
      if (channel === 'marketplace:invoke-plugin') return { emittedCodes: [], resultCode: 0, schemaVersion: 1 }
      return favorites
    })
    const client = createMarketplaceClient(invoke)
    await expect(client.readCatalog()).resolves.toEqual({ reason: 'unconfigured', status: 'unavailable' })
    await expect(client.getFavorites()).resolves.toEqual(favorites)
    await expect(client.setFavorite({
      expectedRevision: 0,
      favorite: true,
      kind: 'theme',
      resourceId: 'pivot.dark',
      sourceId: 'official',
    })).resolves.toEqual(favorites)
    await expect(client.listInstallations()).resolves.toEqual(installations)
    await expect(client.install({ approvedCapabilities: [], expectedCatalogRevision: 0, kind: 'theme', resourceId: 'pivot.dark', sourceId: 'official' }))
      .resolves.toMatchObject({ status: 'installed' })
    await expect(client.uninstall({ expectedRevision: 1, identity })).resolves.toEqual(installations)
    await expect(client.activate({ expectedInstallationRevision: 1, identity })).resolves.toMatchObject({ state: 'active' })
    await expect(client.listActiveResources()).resolves.toEqual({ items: [], schemaVersion: 1 })
    await expect(client.deactivate({ expectedActivationRevision: 0, identity })).resolves.toEqual({ items: [], schemaVersion: 1 })
    await expect(client.invokePlugin({ registrationId: 'registration-1' })).resolves.toEqual({ emittedCodes: [], resultCode: 0, schemaVersion: 1 })
    await expect(client.activate({ expectedInstallationRevision: 1, identity })).resolves.toMatchObject({ state: 'active' })
    await expect(client.listActiveResources()).resolves.toEqual({ items: [], schemaVersion: 1 })
    await expect(client.deactivate({ expectedActivationRevision: 0, identity })).resolves.toEqual({ items: [], schemaVersion: 1 })
    await expect(client.invokePlugin({ registrationId: 'registration-1' })).resolves.toEqual({ emittedCodes: [], resultCode: 0, schemaVersion: 1 })
    expect(invoke).toHaveBeenNthCalledWith(1, 'marketplace:catalog', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'marketplace:favorites', undefined)
  })

  it('fails closed on malformed Main responses', async () => {
    const client = createMarketplaceClient(async () => ({ status: 'available', snapshot: { forged: true } }))
    await expect(client.readCatalog()).rejects.toThrow()
    await expect(client.listInstallations()).rejects.toThrow()
  })
})
