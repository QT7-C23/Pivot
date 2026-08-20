import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Figma Marketplace production workspace', () => {
  it('renders the verified catalog and favorites instead of provider placeholders', () => {
    const page = readFileSync(path.resolve('src/renderer/components/plugin-ecosystem-page.tsx'), 'utf8')
    const store = readFileSync(path.resolve('src/renderer/stores/marketplace.store.ts'), 'utf8')
    expect(page).toContain('useMarketplaceStore')
    expect(page).toContain('catalog.snapshot.entries')
    expect(page).toContain('toggleFavorite')
    expect(page).toContain('Catalog is not configured')
    expect(page).not.toContain('Open Settings')
    expect(store).toContain('createMarketplaceClient')
    expect(store).toContain('MarketplaceCatalogReadResultSchema.parse')
    expect(store).toContain('MarketplaceFavoriteCollectionSchema.parse')
    expect(store).toContain('MarketplaceInstallationCollectionSchema.parse')
    expect(store).toContain('installEntry')
    expect(store).toContain('uninstallEntry')
    expect(page).toContain('requires-approval')
    expect(page).toContain('Install')
    expect(page).toContain('Uninstall')
    expect(page).toContain("'installed'")
    expect(page).toContain('Marketplace sources')
    expect(page).toContain("category === 'installed'")
    expect(page).not.toMatch(/24 extensions found|12\.3K downloads|Dracula Theme/)
  })

  it('uses a fluid card grid with explicit narrow-window fallbacks', () => {
    const css = readFileSync(path.resolve('src/renderer/pivot-v2.css'), 'utf8')
    expect(css).toMatch(/\.pv-marketplace-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\)/s)
    expect(css).toMatch(/@media \(max-width: 1080px\)[\s\S]*\.plugin-ecosystem-page\.surface-marketplace/s)
    expect(css).toMatch(/@media \(max-width: 940px\)[\s\S]*\.pv-marketplace-sidebar/s)
  })
})
