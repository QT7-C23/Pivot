import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')

describe('Marketplace HTTPS Transport boundaries', () => {
  it('keeps the concrete fetch Adapter in Main and capability-narrow', () => {
    const source = readFileSync(
      path.join(root, 'main/services/bounded-https-json-transport-adapter.ts'),
      'utf8',
    )
    expect(source).toContain('MarketplaceCatalogTransportPort')
    expect(source).toContain("redirect: 'manual'")
    expect(source).toContain('AbortController')
    expect(source).not.toMatch(/renderer\/|ipcMain|BrowserWindow|better-sqlite3|node:fs|child_process/)
    expect(source).not.toMatch(/install|spawn\(|execFile\(|execSync\(/i)
  })

  it('constructs concrete Catalog infrastructure only in its composition factory', () => {
    const runtime = readFileSync(path.join(root, 'main/services/marketplace-catalog-runtime.ts'), 'utf8')
    expect(runtime).toContain('new BoundedHttpsJsonTransportAdapter')
    expect(runtime).toContain('new MarketplaceCatalogTrustRegistry')
    expect(runtime).toContain('new SqliteMarketplaceCatalogCacheAdapter')
    expect(runtime).toContain('new VerifiedMarketplaceCatalogAdapter')
    expect(runtime).not.toMatch(/renderer\/|ipcMain|BrowserWindow/)
  })
})
