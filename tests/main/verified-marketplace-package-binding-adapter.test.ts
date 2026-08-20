import path from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { NodeMarketplaceExtractedRootValidationAdapter } from '../../src/main/services/node-marketplace-extracted-root-validation-adapter'
import { VerifiedMarketplacePackageBindingAdapter } from '../../src/main/services/verified-marketplace-package-binding-adapter'
import type { MarketplacePackageBindingRequest } from '../../src/main/services/marketplace-package-binding-ports'

describe('verified Marketplace package binding adapter', () => {
  it('cross-binds Catalog, signed descriptor, manifest and exact extracted files', () => {
    const request = validRequest()
    const bound = binding().bind(request)
    expect(bound.manifest.identity).toEqual({
      kind: request.artifactEvidence.descriptor.kind,
      resourceId: request.artifactEvidence.descriptor.resourceId,
      schemaVersion: 1,
      sourceId: request.artifactEvidence.descriptor.sourceId,
      version: request.artifactEvidence.descriptor.version,
    })
    expect(bound.rootPath).toBe(request.extracted.rootPath)
    expect(Object.keys(bound)).toEqual([
      'artifactEvidence', 'discard', 'extractionEvidence', 'manifest', 'rootPath',
    ])
    expect(Object.isFrozen(bound)).toBe(true)
  })

  it.each([
    ['manifest identity', (request: MarketplacePackageBindingRequest) => ({
      ...request,
      verifiedManifest: {
        ...request.verifiedManifest,
        manifest: { ...request.verifiedManifest.manifest, identity: {
          ...request.verifiedManifest.manifest.identity, version: '2.0.0',
        } },
      },
    })],
    ['publisher', (request: MarketplacePackageBindingRequest) => ({
      ...request,
      verifiedManifest: {
        ...request.verifiedManifest,
        manifest: { ...request.verifiedManifest.manifest, publisherId: 'attacker' },
      },
    })],
    ['signed descriptor', (request: MarketplacePackageBindingRequest) => ({
      ...request,
      artifactEvidence: {
        ...request.artifactEvidence,
        descriptor: { ...request.artifactEvidence.descriptor, sha256: '9'.repeat(64) },
      },
    })],
    ['signature key', (request: MarketplacePackageBindingRequest) => ({
      ...request,
      artifactEvidence: { ...request.artifactEvidence, signatureKeyId: 'other-key' },
    })],
  ])('rejects a %s mismatch', (_label, mutate) => {
    expect(() => binding().bind(mutate(validRequest())))
      .toThrow(/identity|publisher|descriptor|signature|catalog|match/i)
  })

  it('rejects missing, extra, reordered or digest-mismatched extracted payload files', () => {
    for (const files of [
      [manifestEvidence()],
      [manifestEvidence(), payloadEvidence(), { byteLength: 1, path: 'extra.txt', sha256: 'e'.repeat(64) }],
      [payloadEvidence(), manifestEvidence()],
      [manifestEvidence(), { ...payloadEvidence(), sha256: 'f'.repeat(64) }],
    ]) {
      const request = validRequest()
      expect(() => binding().bind({
        ...request,
        extracted: {
          ...request.extracted,
          evidence: { ...request.extracted.evidence, files },
        },
      })).toThrow(/file|payload|evidence|manifest/i)
    }
  })

  it('preserves only the extracted cleanup capability', async () => {
    const request = validRequest()
    const bound = binding().bind(request)
    await bound.discard()
    expect(request.extracted.discard).toHaveBeenCalledOnce()
  })

  it('delegates absolute real-directory validation to a narrow Node capability', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pivot-bound-root-'))
    const target = path.join(root, 'target')
    const linked = path.join(root, 'linked')
    mkdirSync(target)
    symlinkSync(target, linked, 'junction')
    const validation = new NodeMarketplaceExtractedRootValidationAdapter().openValidationPort()
    expect(() => validation.validate(target)).not.toThrow()
    expect(() => validation.validate('relative/path')).toThrow(/absolute/i)
    expect(() => validation.validate(linked)).toThrow(/symbolic|real directory/i)
    rmSync(root, { force: true, recursive: true })
  })
})

function binding() {
  return new VerifiedMarketplacePackageBindingAdapter({
    rootValidation: {
      validate(rootPath) {
        if (!path.isAbsolute(rootPath)) throw new Error('Expected an absolute extracted root')
      },
    },
  }).openBindingPort()
}

function validRequest(): MarketplacePackageBindingRequest {
  const descriptor = {
    byteLength: 123,
    kind: 'plugin' as const,
    resourceId: 'dev.pivot.example',
    schemaVersion: 1 as const,
    sha256: '1'.repeat(64),
    sourceId: 'official',
    version: '1.0.0',
  }
  const manifest = {
    capabilities: [] as const,
    entrypoint: 'dist/index.js',
    files: [payloadEvidence()],
    identity: {
      kind: descriptor.kind,
      resourceId: descriptor.resourceId,
      schemaVersion: 1 as const,
      sourceId: descriptor.sourceId,
      version: descriptor.version,
    },
    publisherId: 'pivot-labs',
    schemaVersion: 1 as const,
  }
  return {
    artifactEvidence: {
      artifactPath: path.resolve('package.pivot'),
      descriptor,
      signatureKeyId: 'official-key',
      status: 'verified',
      verifiedAt: '2026-08-20T00:00:00.000Z',
    },
    catalogEntry: {
      compatibility: { minPivotVersion: '2.0.0' },
      description: 'Example package',
      distribution: { free: true },
      kind: 'plugin',
      manifestUrl: 'https://example.invalid/example/manifest.json',
      name: 'Example',
      package: {
        byteLength: descriptor.byteLength,
        downloadUrl: 'https://example.invalid/example/package.pivot',
        sha256: descriptor.sha256,
        signature: { algorithm: 'ed25519', keyId: 'official-key', value: `${'A'.repeat(86)}==` },
      },
      publisher: { id: 'pivot-labs', name: 'Pivot Labs' },
      resourceId: descriptor.resourceId,
      schemaVersion: 1,
      sourceId: descriptor.sourceId,
      tags: ['example'],
      updatedAt: '2026-08-20T00:00:00.000Z',
      version: descriptor.version,
    },
    extracted: {
      discard: vi.fn(async () => undefined),
      evidence: {
        files: [manifestEvidence(), payloadEvidence()],
        inventory: {
          entries: [
            { compressedByteLength: 10, kind: 'file', path: 'pivot-package.json', uncompressedByteLength: 10 },
            { compressedByteLength: 3, kind: 'file', path: 'dist/index.js', uncompressedByteLength: 3 },
          ],
          schemaVersion: 1,
          totalCompressedBytes: 13,
          totalUncompressedBytes: 13,
        },
        schemaVersion: 1,
        totalBytes: 13,
      },
      rootPath: path.resolve('extracted'),
    },
    verifiedManifest: {
      manifest,
      manifestEvidence: manifestEvidence(),
    },
  }
}

function manifestEvidence() {
  return { byteLength: 10, path: 'pivot-package.json' as const, sha256: 'a'.repeat(64) }
}

function payloadEvidence() {
  return { byteLength: 3, path: 'dist/index.js', sha256: 'b'.repeat(64) }
}
