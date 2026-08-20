import path from 'node:path'
import { handle } from './ipc-registration'
import {
  createMarketplaceProductionCatalogRuntime,
  resolveMarketplaceProductionCatalogConfig,
} from './services/marketplace-production-catalog-runtime'
import { createMarketplaceProductionDeliveryRuntime } from './services/marketplace-production-delivery-runtime'
import type { MarketplaceAgentAugmentationPort } from './services/marketplace-resource-consumer-ports'
import { SqliteMarketplaceFavoriteAdapter } from './services/sqlite-marketplace-favorite-adapter'

interface ClosePort {
  close(): void
}

export type MarketplaceIpcResources = readonly ClosePort[] & Readonly<{
  agentAugmentations: MarketplaceAgentAugmentationPort
}>

export function registerMarketplaceIpc(options: {
  databasePath?: string
  env: Readonly<Record<string, string | undefined>>
  userDataPath?: string
}): MarketplaceIpcResources {
  const databasePath = options.databasePath ?? ':memory:'
  const catalog = createMarketplaceProductionCatalogRuntime({
    databasePath,
    env: options.env,
  })
  const favorites = new SqliteMarketplaceFavoriteAdapter({ databasePath: options.databasePath })
  const favoriteReader = favorites.openReaderPort()
  const favoriteWriter = favorites.openWriterPort()
  const userDataPath = options.userDataPath
    ?? (path.isAbsolute(databasePath) ? path.dirname(databasePath) : null)
  const trustConfig = resolveMarketplaceProductionCatalogConfig(options.env)
  const deliveryRuntime = userDataPath
    ? createMarketplaceProductionDeliveryRuntime({
        catalog: catalog.reader,
        databasePath,
        trustConfig,
        userDataPath,
      })
    : null

  handle('marketplace:catalog', async () => {
    if (!catalog.reader) return { reason: 'unconfigured' as const, status: 'unavailable' as const }
    try {
      return { snapshot: await catalog.reader.readSnapshot(), status: 'available' as const }
    } catch {
      return {
        message: 'The verified Marketplace catalog could not be loaded.',
        reason: 'read-failed' as const,
        status: 'unavailable' as const,
      }
    }
  })
  handle('marketplace:favorites', async () => favoriteReader.getFavorites())
  handle('marketplace:set-favorite', async (request) => favoriteWriter.setFavorite(request))
  handle('marketplace:installations', async () => {
    if (!deliveryRuntime) return { items: [], schemaVersion: 1 as const }
    await deliveryRuntime.ready
    return deliveryRuntime.installations.list()
  })
  handle('marketplace:install', async (request) => {
    if (!deliveryRuntime?.delivery) throw new Error('Marketplace package delivery is not configured')
    await deliveryRuntime.ready
    return deliveryRuntime.delivery.install(request)
  })
  handle('marketplace:uninstall', async (request) => {
    if (!deliveryRuntime) throw new Error('Marketplace installation storage is unavailable')
    await deliveryRuntime.ready
    await deliveryRuntime.installations.uninstall(request)
    return deliveryRuntime.installations.list()
  })
  handle('marketplace:activate', async (request) => {
    if (!deliveryRuntime) throw new Error('Marketplace activation storage is unavailable')
    await deliveryRuntime.ready
    return deliveryRuntime.activation.activate(request)
  })
  handle('marketplace:deactivate', async (request) => {
    if (!deliveryRuntime) throw new Error('Marketplace activation storage is unavailable')
    await deliveryRuntime.ready
    await deliveryRuntime.activation.deactivate(request)
    return deliveryRuntime.activeResources.list()
  })
  handle('marketplace:active-resources', async () => {
    if (!deliveryRuntime) return { items: [], schemaVersion: 1 as const }
    await deliveryRuntime.ready
    return deliveryRuntime.activeResources.list()
  })
  handle('marketplace:invoke-plugin', async (request) => {
    if (!deliveryRuntime) throw new Error('Marketplace plugin sandbox is unavailable')
    await deliveryRuntime.ready
    return deliveryRuntime.pluginInvocation.invoke(request.registrationId)
  })
  handle('marketplace:update', async (request) => {
    if (!deliveryRuntime?.updates) throw new Error('Marketplace package updates are not configured')
    await deliveryRuntime.ready
    return deliveryRuntime.updates.update(request)
  })
  handle('marketplace:updates', async () => {
    if (!deliveryRuntime?.updates) return { items: [], schemaVersion: 1 as const }
    await deliveryRuntime.ready
    return deliveryRuntime.updates.list()
  })
  handle('marketplace:rollback-update', async (request) => {
    if (!deliveryRuntime?.updates) throw new Error('Marketplace package updates are not configured')
    await deliveryRuntime.ready
    return deliveryRuntime.updates.rollback(request)
  })
  handle('marketplace:finalize-update', async (request) => {
    if (!deliveryRuntime?.updates) throw new Error('Marketplace package updates are not configured')
    await deliveryRuntime.ready
    return deliveryRuntime.updates.finalize(request)
  })
  handle('marketplace:qualification', async () => {
    if (!deliveryRuntime) {
      return {
        blockers: [{ code: 'catalog-unavailable' as const, detail: 'Marketplace production storage is unavailable' }],
        checkedAt: new Date().toISOString(), ready: false, schemaVersion: 1 as const,
      }
    }
    await deliveryRuntime.ready
    return deliveryRuntime.qualification.qualify()
  })

  const resources = [catalog, favorites, ...(deliveryRuntime ? [deliveryRuntime] : [])]
  return Object.freeze(Object.assign(resources, {
    agentAugmentations: deliveryRuntime?.agentAugmentations ?? Object.freeze({ read: () => '' }),
  })) as MarketplaceIpcResources
}
