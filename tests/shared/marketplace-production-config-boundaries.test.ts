import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Marketplace production configuration boundaries', () => {
  it('keeps trust-root configuration in Main and concrete composition in the production root', async () => {
    const production = await source('main/services/marketplace-production-catalog-runtime.ts')
    const officialTrust = await source('main/services/marketplace-official-catalog-trust.ts')
    const runtime = await source('main/services/marketplace-catalog-runtime.ts')
    const ipcHandlers = await source('main/ipc-handlers.ts')
    const marketplaceIpc = await source('main/marketplace-ipc.ts')
    const shutdown = await source('main/ipc-runtime-shutdown.ts')

    expect(production).toContain('PIVOT_MARKETPLACE_CATALOG_ENABLED')
    expect(production).toContain('createMarketplaceCatalogRuntime')
    expect(production).toContain('getOfficialMarketplaceCatalogTrustConfig')
    expect(officialTrust).toContain('MarketplaceCatalogSourceSchema')
    expect(officialTrust).toContain('createPublicKey')
    expect(officialTrust).toContain('ea8676fe3125f41e659992541ceaecfca381b76d2b8b8536a4ad7a37e7cd75b6')
    expect(officialTrust).not.toMatch(/PRIVATE KEY|renderer\//)
    expect(production).not.toMatch(/ipcMain|BrowserWindow|renderer\//)
    expect(runtime).not.toMatch(/process\.env|PIVOT_MARKETPLACE_CATALOG_ENABLED/)
    expect(ipcHandlers).toContain('registerMarketplaceIpc')
    expect(ipcHandlers).toMatch(/resources:\s*\[[\s\S]*\.\.\.marketplaceResources/)
    expect(marketplaceIpc).toContain('createMarketplaceProductionCatalogRuntime')
    expect(marketplaceIpc).toContain('createMarketplaceProductionDeliveryRuntime')
    expect(marketplaceIpc).toContain('const resources = [catalog, favorites, ...(deliveryRuntime ? [deliveryRuntime] : [])]')
    expect(marketplaceIpc).toContain('agentAugmentations: deliveryRuntime?.agentAugmentations')
    expect(shutdown).toContain('resource?.close()')
  })

  it('does not expose the configured URL, public key, trust root, database, or transport to Renderer/Preload/shared', async () => {
    const files = [
      ...(await filesBelow('src/shared', 'src/renderer')),
      path.resolve('src/main/preload.ts'),
    ]
    const combined = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n')

    expect(combined).not.toContain('PIVOT_MARKETPLACE_CATALOG_ENABLED')
    expect(combined).not.toContain('ea8676fe3125f41e659992541ceaecfca381b76d2b8b8536a4ad7a37e7cd75b6')
    expect(combined).not.toContain('MarketplaceTrustedCatalogConfig')
    expect(combined).not.toContain('createMarketplaceCatalogRuntime')
    expect(combined).not.toContain('BoundedHttpsJsonTransportAdapter')
    expect(combined).not.toContain('SqliteMarketplaceCatalogCacheAdapter')
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}

async function filesBelow(...roots: string[]): Promise<string[]> {
  const results: string[] = []
  for (const root of roots) {
    const entries = await readdir(path.resolve(root), { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        results.push(path.join(entry.parentPath, entry.name))
      }
    }
  }
  return results
}
