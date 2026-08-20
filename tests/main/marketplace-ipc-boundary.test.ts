import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Marketplace Main IPC boundary', () => {
  it('exposes only public delivery requests, reader and favorite capabilities to the renderer', () => {
    const composition = readFileSync(path.resolve('src/main/ipc-handlers.ts'), 'utf8')
    const handlers = readFileSync(path.resolve('src/main/marketplace-ipc.ts'), 'utf8')
    const preload = readFileSync(path.resolve('src/main/preload.ts'), 'utf8')
    expect(composition).toContain('registerMarketplaceIpc')
    expect(handlers).toContain('new SqliteMarketplaceFavoriteAdapter')
    expect(handlers).toContain("handle('marketplace:catalog'")
    expect(handlers).toContain("handle('marketplace:favorites'")
    expect(handlers).toContain("handle('marketplace:set-favorite'")
    expect(handlers).toContain("handle('marketplace:installations'")
    expect(handlers).toContain("handle('marketplace:install'")
    expect(handlers).toContain("handle('marketplace:uninstall'")
    expect(handlers).toContain("handle('marketplace:activate'")
    expect(handlers).toContain("handle('marketplace:deactivate'")
    expect(handlers).toContain("handle('marketplace:invoke-plugin'")
    expect(handlers).toContain('favorites.openReaderPort()')
    expect(handlers).toContain('favorites.openWriterPort()')
    expect(handlers).toContain('const resources = [catalog, favorites, ...(deliveryRuntime ? [deliveryRuntime] : [])]')
    expect(composition).toContain('marketplaceAugmentations: marketplaceResources.agentAugmentations')
    expect(preload).not.toContain('SqliteMarketplaceFavoriteAdapter')
    expect(preload).not.toContain('MarketplaceCatalogReaderPort')
    expect(preload).not.toMatch(/InstallationStorage|databasePath|rootPath/)
  })
})
