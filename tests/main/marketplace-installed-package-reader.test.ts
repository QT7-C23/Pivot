import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeMarketplaceInstalledPackageReaderAdapter } from '../../src/main/services/node-marketplace-installed-package-reader-adapter'
import type { MarketplaceInstallationRegistryReaderPort } from '../../src/main/services/marketplace-installation-ports'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('NodeMarketplaceInstalledPackageReaderAdapter', () => {
  it('reads and re-hashes a strict installed prompt resource', async () => {
    const fixture = createFixture()
    const reader = fixture.adapter.openReaderPort()
    await expect(reader.readManifest(fixture.identity)).resolves.toMatchObject({ identity: fixture.identity })
    await expect(reader.readResource(fixture.identity)).resolves.toMatchObject({ kind: 'prompt', content: 'Review carefully.' })
  })

  it('fails when installed content is replaced after installation evidence', async () => {
    const fixture = createFixture()
    writeFileSync(path.join(fixture.packageRoot, 'prompt.json'), JSON.stringify({
      content: 'Tampered', id: fixture.identity.resourceId, kind: 'prompt', schemaVersion: 1, title: 'Review',
    }))
    await expect(fixture.adapter.openReaderPort().readResource(fixture.identity)).rejects.toThrow(/digest|length|evidence/i)
  })
})

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-installed-reader-'))
  roots.push(root)
  const installRoot = path.join(root, 'installed')
  const storageKey = 'a'.repeat(64)
  const packageRoot = path.join(installRoot, storageKey)
  mkdirSync(packageRoot, { recursive: true })
  const identity = { kind: 'prompt' as const, resourceId: 'review', schemaVersion: 1 as const, sourceId: 'official', version: '1.0.0' }
  const resourceBytes = Buffer.from(JSON.stringify({
    content: 'Review carefully.', id: identity.resourceId, kind: 'prompt', schemaVersion: 1, title: 'Review',
  }))
  const manifest = {
    capabilities: [], entrypoint: 'prompt.json', identity, publisherId: 'pivot-labs', schemaVersion: 1 as const,
    files: [{ byteLength: resourceBytes.byteLength, path: 'prompt.json', sha256: createHash('sha256').update(resourceBytes).digest('hex') }],
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  writeFileSync(path.join(packageRoot, 'prompt.json'), resourceBytes)
  writeFileSync(path.join(packageRoot, 'pivot-package.json'), manifestBytes)
  const installations: MarketplaceInstallationRegistryReaderPort = {
    get: () => ({
      capabilities: [], createdAt: '2026-08-21T00:00:00.000Z', identity,
      manifestEvidence: { byteLength: manifestBytes.byteLength, path: 'pivot-package.json' as const, sha256: createHash('sha256').update(manifestBytes).digest('hex') },
      revision: 1, schemaVersion: 1,
      state: 'installed', storageKey, updatedAt: '2026-08-21T00:00:00.000Z',
    }),
    listInstalled: () => [], listRecoverable: () => [],
  }
  return {
    adapter: new NodeMarketplaceInstalledPackageReaderAdapter({ installations, installRoot }),
    identity, packageRoot,
  }
}
