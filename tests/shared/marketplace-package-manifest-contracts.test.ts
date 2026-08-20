import { describe, expect, it } from 'vitest'
import { MarketplacePackageManifestSchema } from '../../src/shared/marketplace-package-manifest-contracts'

function manifest() {
  return {
    capabilities: ['workspace.read'],
    entrypoint: 'dist/index.js',
    files: [
      { byteLength: 3, path: 'dist/index.js', sha256: 'a'.repeat(64) },
      { byteLength: 4, path: 'README.md', sha256: 'b'.repeat(64) },
    ],
    identity: {
      kind: 'plugin',
      resourceId: 'dev.pivot.example',
      schemaVersion: 1,
      sourceId: 'official',
      version: '1.2.3',
    },
    publisherId: 'pivot-labs',
    schemaVersion: 1,
  }
}

describe('Marketplace package manifest contract', () => {
  it('accepts and freezes one strict portable manifest', () => {
    const parsed = MarketplacePackageManifestSchema.parse(manifest())
    expect(parsed.entrypoint).toBe('dist/index.js')
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.files)).toBe(true)
  })

  it('rejects unknown fields, duplicate paths and undeclared entrypoints', () => {
    expect(() => MarketplacePackageManifestSchema.parse({ ...manifest(), installScript: 'run-me' })).toThrow()
    expect(() => MarketplacePackageManifestSchema.parse({
      ...manifest(),
      files: [
        { byteLength: 1, path: 'A.js', sha256: 'a'.repeat(64) },
        { byteLength: 1, path: 'a.JS', sha256: 'b'.repeat(64) },
      ],
      entrypoint: 'A.js',
    })).toThrow(/unique|collision/i)
    expect(() => MarketplacePackageManifestSchema.parse({ ...manifest(), entrypoint: 'missing.js' }))
      .toThrow(/entrypoint/i)
  })

  it('rejects traversal, manifest self-reference and duplicate capabilities', () => {
    expect(() => MarketplacePackageManifestSchema.parse({
      ...manifest(),
      files: [{ byteLength: 1, path: '../escape', sha256: 'a'.repeat(64) }],
    })).toThrow(/path|entrypoint/i)
    expect(() => MarketplacePackageManifestSchema.parse({
      ...manifest(),
      entrypoint: 'pivot-package.json',
      files: [{ byteLength: 1, path: 'pivot-package.json', sha256: 'a'.repeat(64) }],
    })).toThrow(/manifest|entrypoint/i)
    expect(() => MarketplacePackageManifestSchema.parse({
      ...manifest(),
      capabilities: ['network.fetch', 'network.fetch'],
    })).toThrow(/unique/i)
  })
})
