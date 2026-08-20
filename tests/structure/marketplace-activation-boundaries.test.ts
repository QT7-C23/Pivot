import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Marketplace activation boundaries', () => {
  it('keeps filesystem and concrete registries out of shared and renderer code', () => {
    const contracts = readFileSync(path.resolve('src/shared/marketplace-activation-contracts.ts'), 'utf8')
    const ports = readFileSync(path.resolve('src/main/services/marketplace-activation-ports.ts'), 'utf8')
    const coordinator = readFileSync(path.resolve('src/main/services/marketplace-activation-coordinator.ts'), 'utf8')
    expect(contracts).not.toMatch(/node:fs|better-sqlite3|rootPath|entrypoint/)
    expect(ports).not.toContain('better-sqlite3')
    expect(coordinator).not.toContain('node:fs')
    expect(coordinator).not.toContain('SqliteMarketplaceActivationRegistryAdapter')
    expect(coordinator).toContain('MarketplaceResourceRegistrationPort')
  })
})
