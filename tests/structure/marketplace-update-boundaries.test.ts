import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Marketplace update boundaries', () => {
  it('coordinates only through narrow install, lifecycle, switch and evidence Ports', () => {
    const source = readFileSync(path.resolve('src/main/services/marketplace-update-coordinator.ts'), 'utf8')
    expect(source).not.toMatch(/node:fs|better-sqlite3|NodeMarketplace|SqliteMarketplace/)
    expect(source).toContain('MarketplaceResourceVersionSwitchPort')
    expect(source).toContain('MarketplaceInstallationPort')
    expect(source).toContain('MarketplaceInstallationLifecyclePort')
  })
})
