import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Figma Marketplace production workspace', () => {
  it('uses the exact Toolkit frame for the installed-resource inventory', () => {
    const page = readFileSync(path.resolve('src/renderer/components/plugin-ecosystem-page.tsx'), 'utf8')
    expect(page).toContain('data-figma-screen="1476:8909"')
    expect(page).toContain('installations?.items')
    expect(page).not.toContain('data-figma-screen="549:3543"')
  })

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
    for (const node of ['818:9249', '818:22103', '818:10388', '818:20102', '818:20379', '818:20645', '818:21049', '818:22354', '818:22642', '818:23054']) expect(page).toContain(node)
    expect(page).toContain('MarketplaceDetail')
    expect(page).toContain('Signed catalog metadata does not include')
    expect(page).not.toMatch(/24 extensions found|12\.3K downloads|Dracula Theme/)
  })

  it('uses a fluid card grid inside the fixed Figma desktop canvas', () => {
    const css = readFileSync(path.resolve('src/renderer/pivot-v2.css'), 'utf8')
    expect(css).toMatch(/\.pv-marketplace-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\)/s)
    expect(css).toMatch(/\.plugin-ecosystem-page\.surface-marketplace\s*\{[^}]*grid-template-columns:\s*220px minmax\(0, 1fr\)/s)
    expect(css).not.toMatch(/@media \(max-width:/)
  })
})
