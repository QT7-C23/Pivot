import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')

describe('verified Marketplace Catalog Reader boundaries', () => {
  it('keeps canonical signing payload construction pure and shared', () => {
    const contract = readFileSync(path.join(root, 'shared/marketplace-contracts.ts'), 'utf8')
    expect(contract).toContain('serializeMarketplaceCatalogPayload')
    expect(contract).not.toMatch(/node:crypto|createPublicKey|verify\(/)
  })

  it('keeps transport, trust and cache behind narrow Main Ports', () => {
    const ports = readFileSync(path.join(root, 'main/services/marketplace-catalog-ports.ts'), 'utf8')
    expect(ports).toContain('MarketplaceCatalogTransportPort')
    expect(ports).toContain('MarketplaceCatalogTrustReaderPort')
    expect(ports).toContain('MarketplaceCatalogCacheReaderPort')
    expect(ports).toContain('MarketplaceCatalogCacheWriterPort')
    expect(ports).not.toMatch(/better-sqlite3|BrowserWindow|ipcMain|privateKey|install|execute/i)
  })

  it('keeps concrete trust, crypto and SQLite implementations Main-only', () => {
    const verifier = readFileSync(path.join(root, 'main/services/verified-marketplace-catalog-adapter.ts'), 'utf8')
    const trust = readFileSync(path.join(root, 'main/services/marketplace-catalog-trust-registry.ts'), 'utf8')
    const cache = readFileSync(path.join(root, 'main/services/sqlite-marketplace-catalog-cache-adapter.ts'), 'utf8')
    expect(verifier).not.toMatch(/renderer\/|ipcMain|BrowserWindow|better-sqlite3/)
    expect(trust).toContain("from 'node:crypto'")
    expect(cache).toContain("from 'better-sqlite3'")
    expect(`${verifier}\n${trust}\n${cache}`).not.toMatch(
      /node:child_process|node:fs|spawn\(|execFile\(|execSync\(/i,
    )
  })
})
