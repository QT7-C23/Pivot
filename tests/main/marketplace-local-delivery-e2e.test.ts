import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  serializeMarketplacePackageArtifactDescriptor,
  type MarketplaceCatalogEntry,
} from '../../src/shared/marketplace-contracts'
import { createMarketplaceProductionDeliveryRuntime } from '../../src/main/services/marketplace-production-delivery-runtime'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }) })

describe('Marketplace local signed delivery end to end', () => {
  it('downloads, verifies, extracts, installs, lists and uninstalls a real signed ZIP', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-e2e-'))
    roots.push(root)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const identity = { kind: 'theme' as const, resourceId: 'dev.pivot.midnight', schemaVersion: 1 as const, sourceId: 'local-test', version: '1.0.0' }
    const theme = '{"accent":"#7067f0"}'
    const themeEvidence = evidence('theme.json', theme)
    const manifest = JSON.stringify({ capabilities: [], entrypoint: 'theme.json', files: [themeEvidence], identity, publisherId: 'pivot-labs', schemaVersion: 1 })
    const archive = storedZip([{ name: 'pivot-package.json', value: manifest }, { name: 'theme.json', value: theme }])
    const descriptor = { ...identity, byteLength: archive.byteLength, sha256: createHash('sha256').update(archive).digest('hex') }
    const signature = sign(null, Buffer.from(serializeMarketplacePackageArtifactDescriptor(descriptor), 'utf8'), privateKey).toString('base64')
    const entry: MarketplaceCatalogEntry = {
      compatibility: { minPivotVersion: '2.0.0' }, description: 'Midnight theme', distribution: { free: true },
      kind: identity.kind, manifestUrl: 'https://packages.example.test/manifest.json', name: 'Midnight',
      package: { byteLength: archive.byteLength, downloadUrl: 'https://packages.example.test/theme.zip', sha256: descriptor.sha256, signature: { algorithm: 'ed25519', keyId: 'local-key', value: signature } },
      publisher: { id: 'pivot-labs', name: 'Pivot Labs' }, resourceId: identity.resourceId, schemaVersion: 1,
      sourceId: identity.sourceId, tags: ['theme'], updatedAt: '2026-08-20T00:00:00.000Z', version: identity.version,
    }
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(archive), {
      headers: { 'content-length': String(archive.byteLength), 'content-type': 'application/zip' }, status: 200,
    }))
    const runtime = createMarketplaceProductionDeliveryRuntime({
      catalog: { readSnapshot: async () => ({ entries: [entry], revision: 3 }) as never },
      databasePath: path.join(root, 'pivot.sqlite'), fetchImpl,
      trustConfig: { publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(), source: { catalogUrl: 'https://packages.example.test/catalog.json', displayName: 'Local test', id: 'local-test', schemaVersion: 1, trust: { algorithm: 'ed25519', keyId: 'local-key' } } },
      userDataPath: root,
    })
    await runtime.ready
    const result = await runtime.delivery!.install({ approvedCapabilities: [], expectedCatalogRevision: 3, kind: identity.kind, resourceId: identity.resourceId, sourceId: identity.sourceId })
    expect(result).toMatchObject({ status: 'installed', installation: { identity, state: 'installed' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const collection = runtime.installations.list()
    expect(collection.items).toHaveLength(1)
    expect(collection.items[0]).not.toHaveProperty('storageKey')
    expect(readdirSync(path.join(root, 'marketplace', 'staging'))).toEqual([])
    expect(readdirSync(path.join(root, 'marketplace', 'extracted'))).toEqual([])
    await runtime.installations.uninstall({ expectedRevision: collection.items[0]!.revision, identity })
    expect(runtime.installations.list().items).toEqual([])
    expect(readdirSync(path.join(root, 'marketplace', 'installed'))).toEqual([])
    runtime.close()
  })
})

function evidence(relativePath: string, value: string) {
  return { byteLength: Buffer.byteLength(value), path: relativePath, sha256: createHash('sha256').update(value).digest('hex') }
}

function storedZip(files: readonly { name: string; value: string }[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.value, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + data.length
  }
  const central = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, central, end])
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
