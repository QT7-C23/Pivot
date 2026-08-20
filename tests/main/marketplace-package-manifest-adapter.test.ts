import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeMarketplacePackageManifestInspectionAdapter } from '../../src/main/services/node-marketplace-package-manifest-inspection-adapter'
import { VerifiedMarketplacePackageManifestAdapter } from '../../src/main/services/verified-marketplace-package-manifest-adapter'
import type { MarketplaceExtractedPackagePort } from '../../src/main/services/marketplace-package-archive-ports'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace package manifest adapter', () => {
  it('reads a real bounded manifest and binds it to extracted digest evidence', async () => {
    const fixture = createFixture()
    const result = await fixture.reader.read(fixture.extracted)
    expect(result.manifest.identity.resourceId).toBe('dev.pivot.example')
    expect(result.manifestEvidence.sha256).toBe(fixture.manifestDigest)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('rejects malformed JSON, symbolic links, oversized files and forged extraction evidence', async () => {
    const malformed = createFixture('{bad-json')
    await expect(malformed.reader.read(malformed.extracted)).rejects.toThrow(/json|manifest/i)

    const linked = createFixture()
    rmSync(path.join(linked.root, 'pivot-package.json'))
    writeFileSync(path.join(linked.root, 'outside.json'), linked.manifestText)
    symlinkSync(path.join(linked.root, 'outside.json'), path.join(linked.root, 'pivot-package.json'))
    await expect(linked.reader.read(linked.extracted)).rejects.toThrow(/symbolic|regular/i)

    const oversized = createFixture(' '.repeat(256 * 1024 + 1))
    await expect(oversized.reader.read(oversized.extracted)).rejects.toThrow(/size|limit|large/i)

    const forged = createFixture()
    const forgedPort = {
      ...forged.extracted,
      evidence: {
        ...forged.extracted.evidence,
        files: forged.extracted.evidence.files.map((file) => file.path === 'pivot-package.json'
          ? { ...file, sha256: '0'.repeat(64) }
          : file),
      },
    } as MarketplaceExtractedPackagePort
    await expect(forged.reader.read(forgedPort)).rejects.toThrow(/digest|evidence|sha/i)
  })
})

function createFixture(manifestText = JSON.stringify(validManifest())) {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-manifest-'))
  roots.push(root)
  mkdirSync(path.join(root, 'dist'))
  writeFileSync(path.join(root, 'pivot-package.json'), manifestText)
  writeFileSync(path.join(root, 'dist/index.js'), 'run')
  const manifestBytes = Buffer.from(manifestText)
  const manifestDigest = createHash('sha256').update(manifestBytes).digest('hex')
  const extracted = Object.freeze({
    discard: async () => undefined,
    evidence: Object.freeze({
      files: Object.freeze([
        Object.freeze({ byteLength: manifestBytes.byteLength, path: 'pivot-package.json', sha256: manifestDigest }),
        Object.freeze({ byteLength: 3, path: 'dist/index.js', sha256: createHash('sha256').update('run').digest('hex') }),
      ]),
      inventory: Object.freeze({
        entries: Object.freeze([
          Object.freeze({
            compressedByteLength: manifestBytes.byteLength,
            kind: 'file' as const,
            path: 'pivot-package.json',
            uncompressedByteLength: manifestBytes.byteLength,
          }),
          Object.freeze({
            compressedByteLength: 3,
            kind: 'file' as const,
            path: 'dist/index.js',
            uncompressedByteLength: 3,
          }),
        ]),
        schemaVersion: 1 as const,
        totalCompressedBytes: manifestBytes.byteLength + 3,
        totalUncompressedBytes: manifestBytes.byteLength + 3,
      }),
      schemaVersion: 1 as const,
      totalBytes: manifestBytes.byteLength + 3,
    }),
    rootPath: root,
  }) as MarketplaceExtractedPackagePort
  const inspection = new NodeMarketplacePackageManifestInspectionAdapter().openInspectionPort()
  const reader = new VerifiedMarketplacePackageManifestAdapter({ inspection }).openReaderPort()
  return { extracted, manifestDigest, manifestText, reader, root }
}

function validManifest() {
  return {
    capabilities: [],
    entrypoint: 'dist/index.js',
    files: [{
      byteLength: 3,
      path: 'dist/index.js',
      sha256: createHash('sha256').update('run').digest('hex'),
    }],
    identity: {
      kind: 'plugin', resourceId: 'dev.pivot.example', schemaVersion: 1,
      sourceId: 'official', version: '1.0.0',
    },
    publisherId: 'pivot-labs',
    schemaVersion: 1,
  }
}
