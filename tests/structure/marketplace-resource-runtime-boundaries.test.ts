import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Marketplace resource runtime boundaries', () => {
  it('keeps resource contracts in Shared and concrete authority in Main', () => {
    const shared = readFileSync(path.resolve('src/shared/marketplace-resource-contracts.ts'), 'utf8')
    const renderer = readFileSync(path.resolve('src/renderer/services/marketplace-client.ts'), 'utf8')
    const consumer = readFileSync(path.resolve('src/main/services/marketplace-resource-consumer-adapter.ts'), 'utf8')
    const sandbox = readFileSync(path.resolve('src/main/services/marketplace-wasm-plugin-sandbox-adapter.ts'), 'utf8')
    expect(shared).not.toMatch(/node:|\.\.\/main|\.\.\/renderer/)
    expect(renderer).not.toMatch(/node:fs|better-sqlite3|InstallationStorage|WasmPluginSandboxAdapter/)
    expect(consumer).toContain('MarketplaceResourceRegistrationPort')
    expect(sandbox).toContain("from 'node:worker_threads'")
    expect(sandbox).not.toMatch(/node:fs|child_process|process\.env|secrets/i)
  })
})
