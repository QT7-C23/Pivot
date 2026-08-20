import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketplaceInstallationCoordinator } from '../../src/main/services/marketplace-installation-coordinator'
import { NodeMarketplaceInstallationStorageAdapter } from '../../src/main/services/node-marketplace-installation-storage-adapter'
import { SqliteMarketplaceInstallationRegistryAdapter } from '../../src/main/services/sqlite-marketplace-installation-registry-adapter'
import type { MarketplaceInstallationRegistryWriterPort } from '../../src/main/services/marketplace-installation-ports'

const roots: string[] = []
const registries: SqliteMarketplaceInstallationRegistryAdapter[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) {
    try { registry.close() } catch { /* already closed by restart test */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace transactional installation foundation', () => {
  it('persists an installed record and atomically copies exact verified files', async () => {
    const fixture = createFixture()
    const record = await fixture.coordinator.install(fixture.bound, fixture.review)
    expect(record).toMatchObject({ revision: 1, state: 'installed' })
    expect(fixture.registry.openReaderPort().get(record.identity)).toEqual(record)
    expect(fixture.registry.openReaderPort().listInstalled()).toEqual([record])
    expect(await fixture.storage.openStoragePort().exists(record.identity)).toBe(true)
    const final = readdirSync(fixture.installRoot).find((entry) => /^[a-f0-9]{64}$/.test(entry))
    expect(final).toBeTruthy()
    expect(readFileSync(path.join(fixture.installRoot, final!, 'dist/index.js'), 'utf8')).toBe('run')
  })

  it('uses a versioned persistent registry and rejects stale transitions or duplicate installs', () => {
    const fixture = createFixture()
    const writer = fixture.registry.openWriterPort()
    const record = writer.begin({ review: fixture.review, storageKey: '1'.repeat(64) })
    expect(() => writer.begin({ review: fixture.review, storageKey: '1'.repeat(64) })).toThrow(/exists|installed/i)
    const installed = writer.transition({
      expectedRevision: 0, identity: record.identity, state: 'installed',
    })
    expect(() => writer.transition({
      expectedRevision: 0, identity: record.identity, state: 'removing',
    })).toThrow(/revision|stale/i)
    fixture.registry.close()

    const reopened = new SqliteMarketplaceInstallationRegistryAdapter({ databasePath: fixture.databasePath })
    expect(reopened.openReaderPort().get(record.identity)).toEqual(installed)
    reopened.close()
  })

  it('rejects missing capability approval before creating registry or filesystem state', async () => {
    const fixture = createFixture()
    await expect(fixture.coordinator.install(fixture.bound, {
      ...fixture.review,
      approvedCapabilities: [],
      status: 'requires-approval',
    })).rejects.toThrow(/approved|capability/i)
    expect(fixture.registry.openReaderPort().get(fixture.bound.manifest.identity)).toBeNull()
    expect(readdirSync(fixture.installRoot)).toEqual([])
  })

  it('rolls back committed storage and records failure when registry commit fails', async () => {
    const fixture = createFixture()
    const realWriter = fixture.registry.openWriterPort()
    let rejectedCommit = false
    const writer: MarketplaceInstallationRegistryWriterPort = {
      begin: (request) => realWriter.begin(request),
      delete: (request) => realWriter.delete(request),
      transition: (request) => {
        if (request.state === 'installed' && !rejectedCommit) {
          rejectedCommit = true
          throw new Error('injected registry commit failure')
        }
        return realWriter.transition(request)
      },
    }
    const coordinator = new MarketplaceInstallationCoordinator({
      registryReader: fixture.registry.openReaderPort(), registryWriter: writer,
      storage: fixture.storage.openStoragePort(),
    }).openInstallationPort()
    await expect(coordinator.install(fixture.bound, fixture.review)).rejects.toThrow(/registry commit/i)
    expect(await fixture.storage.openStoragePort().exists(fixture.bound.manifest.identity)).toBe(false)
    expect(fixture.registry.openReaderPort().get(fixture.bound.manifest.identity)?.state).toBe('failed')
    expect(readdirSync(fixture.installRoot)).toEqual([])
  })

  it('rejects a symbolic-link source file and removes partial installation residue', async () => {
    const fixture = createFixture()
    rmSync(path.join(fixture.sourceRoot, 'dist/index.js'))
    writeFileSync(path.join(fixture.sourceRoot, 'outside.js'), 'run')
    symlinkSync(path.join(fixture.sourceRoot, 'outside.js'), path.join(fixture.sourceRoot, 'dist/index.js'))
    await expect(fixture.coordinator.install(fixture.bound, fixture.review)).rejects.toThrow(/symbolic|regular/i)
    expect(readdirSync(fixture.installRoot)).toEqual([])
    expect(fixture.registry.openReaderPort().get(fixture.bound.manifest.identity)?.state).toBe('failed')
  })
})

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-installation-'))
  roots.push(root)
  const sourceRoot = path.join(root, 'source')
  const installRoot = path.join(root, 'installed')
  const databasePath = path.join(root, 'registry.sqlite')
  mkdirSync(path.join(sourceRoot, 'dist'), { recursive: true })
  mkdirSync(installRoot)
  const manifestText = JSON.stringify({ package: 'manifest' })
  writeFileSync(path.join(sourceRoot, 'pivot-package.json'), manifestText)
  writeFileSync(path.join(sourceRoot, 'dist/index.js'), 'run')
  const files = [
    evidence('pivot-package.json', manifestText),
    evidence('dist/index.js', 'run'),
  ]
  const identity = {
    kind: 'plugin' as const, resourceId: 'dev.pivot.example', schemaVersion: 1 as const,
    sourceId: 'official', version: '1.0.0',
  }
  const bound = {
    artifactEvidence: {
      artifactPath: path.join(root, 'package.pivot'),
      descriptor: { ...identity, byteLength: 10, sha256: 'a'.repeat(64) },
      signatureKeyId: 'official-key', status: 'verified' as const,
      verifiedAt: '2026-08-20T00:00:00.000Z',
    },
    discard: async () => undefined,
    extractionEvidence: {
      files,
      inventory: {
        entries: files.map((file) => ({
          compressedByteLength: file.byteLength, kind: 'file' as const, path: file.path,
          uncompressedByteLength: file.byteLength,
        })),
        schemaVersion: 1 as const,
        totalCompressedBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
        totalUncompressedBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
      },
      schemaVersion: 1 as const,
      totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
    },
    manifest: {
      capabilities: ['workspace.read'] as const,
      entrypoint: 'dist/index.js', files: [files[1]!], identity,
      publisherId: 'pivot-labs', schemaVersion: 1 as const,
    },
    rootPath: sourceRoot,
  }
  const review = {
    approvedCapabilities: ['workspace.read'] as const,
    declaredCapabilities: ['workspace.read'] as const,
    identity,
    reviewedAt: '2026-08-20T00:00:00.000Z', riskLevel: 'low' as const,
    schemaVersion: 1 as const, status: 'approved' as const,
  }
  const registry = new SqliteMarketplaceInstallationRegistryAdapter({
    clock: () => new Date('2026-08-20T00:00:00.000Z'), databasePath,
  })
  registries.push(registry)
  const storage = new NodeMarketplaceInstallationStorageAdapter({ installRoot })
  const coordinator = new MarketplaceInstallationCoordinator({
    registryReader: registry.openReaderPort(), registryWriter: registry.openWriterPort(),
    storage: storage.openStoragePort(),
  }).openInstallationPort()
  return { bound, coordinator, databasePath, installRoot, registry, review, sourceRoot, storage }
}

function evidence(relativePath: string, content: string) {
  return {
    byteLength: Buffer.byteLength(content), path: relativePath,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}
