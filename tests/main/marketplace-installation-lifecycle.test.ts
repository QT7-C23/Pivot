import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketplaceInstallationLifecycleCoordinator } from '../../src/main/services/marketplace-installation-lifecycle-coordinator'
import { NodeMarketplaceInstallationStorageAdapter } from '../../src/main/services/node-marketplace-installation-storage-adapter'
import { SqliteMarketplaceInstallationRegistryAdapter } from '../../src/main/services/sqlite-marketplace-installation-registry-adapter'
import type { MarketplaceInstallationStoragePort } from '../../src/main/services/marketplace-installation-ports'

const roots: string[] = []
const registries: SqliteMarketplaceInstallationRegistryAdapter[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) {
    try { registry.close() } catch { /* closed for restart */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace installation lifecycle', () => {
  it('uninstalls only the expected installed revision and removes registry and storage', async () => {
    const fixture = createFixture()
    const installed = await createInstalled(fixture, identity('one'))
    await fixture.lifecycle.openLifecyclePort().uninstall(installed.identity, installed.revision)
    expect(fixture.registry.openReaderPort().get(installed.identity)).toBeNull()
    expect(await fixture.storage.exists(installed.identity)).toBe(false)
  })

  it('rejects stale uninstall authority without touching installed bytes', async () => {
    const fixture = createFixture()
    const installed = await createInstalled(fixture, identity('stale'))
    await expect(fixture.lifecycle.openLifecyclePort().uninstall(installed.identity, 0))
      .rejects.toThrow(/revision|stale/i)
    expect(await fixture.storage.exists(installed.identity)).toBe(true)
    expect(fixture.registry.openReaderPort().get(installed.identity)?.state).toBe('installed')
  })

  it('records a failed removal when storage cleanup fails', async () => {
    const fixture = createFixture()
    const installed = await createInstalled(fixture, identity('failure'))
    const failingStorage: MarketplaceInstallationStoragePort = {
      ...fixture.storage,
      remove: async () => { throw new Error('injected removal failure') },
    }
    const lifecycle = new MarketplaceInstallationLifecycleCoordinator({
      registryReader: fixture.registry.openReaderPort(),
      registryWriter: fixture.registry.openWriterPort(),
      storage: failingStorage,
    }).openLifecyclePort()
    await expect(lifecycle.uninstall(installed.identity, installed.revision)).rejects.toThrow(/removal failure/i)
    expect(fixture.registry.openReaderPort().get(installed.identity)).toMatchObject({
      revision: 3, state: 'failed',
    })
    expect(await fixture.storage.exists(installed.identity)).toBe(true)
  })

  it('recovers interrupted install/removal after a real database restart without residue', async () => {
    const fixture = createFixture()
    const interruptedInstall = identity('interrupted-install')
    const installReview = review(interruptedInstall)
    fixture.registry.openWriterPort().begin({
      review: installReview,
      storageKey: fixture.storage.keyFor(interruptedInstall),
    })
    await fixture.storage.stage(stageRequest(fixture, interruptedInstall))

    const interruptedRemoval = await createInstalled(fixture, identity('interrupted-removal'))
    fixture.registry.openWriterPort().transition({
      expectedRevision: interruptedRemoval.revision,
      identity: interruptedRemoval.identity,
      state: 'removing',
    })
    fixture.registry.close()

    const reopened = new SqliteMarketplaceInstallationRegistryAdapter({
      clock: fixture.clock, databasePath: fixture.databasePath,
    })
    registries.push(reopened)
    const recovery = new MarketplaceInstallationLifecycleCoordinator({
      registryReader: reopened.openReaderPort(), registryWriter: reopened.openWriterPort(),
      storage: fixture.storage,
    }).openRecoveryPort()
    expect(await recovery.recover()).toEqual([
      { action: 'installation-failed-cleaned', identity: interruptedInstall },
      { action: 'removal-completed', identity: interruptedRemoval.identity },
    ])
    expect(reopened.openReaderPort().get(interruptedInstall)).toMatchObject({ state: 'failed' })
    expect(reopened.openReaderPort().get(interruptedRemoval.identity)).toBeNull()
    expect(readdirSync(fixture.installRoot)).toEqual([])
  })

  it('fails closed when persisted recovery state is corrupted', async () => {
    const fixture = createFixture()
    fixture.registry.openWriterPort().begin({
      review: review(identity('corrupt')),
      storageKey: fixture.storage.keyFor(identity('corrupt')),
    })
    fixture.registry.close()
    const db = new Database(fixture.databasePath)
    db.prepare("UPDATE marketplace_installations SET record_json = '{bad-json'").run()
    db.close()
    const reopened = new SqliteMarketplaceInstallationRegistryAdapter({ databasePath: fixture.databasePath })
    registries.push(reopened)
    const recovery = new MarketplaceInstallationLifecycleCoordinator({
      registryReader: reopened.openReaderPort(), registryWriter: reopened.openWriterPort(),
      storage: fixture.storage,
    }).openRecoveryPort()
    await expect(recovery.recover()).rejects.toThrow(/invalid persisted/i)
  })
})

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-install-lifecycle-'))
  roots.push(root)
  const sourceRoot = path.join(root, 'source')
  const installRoot = path.join(root, 'installed')
  const databasePath = path.join(root, 'registry.sqlite')
  mkdirSync(sourceRoot)
  mkdirSync(installRoot)
  writeFileSync(path.join(sourceRoot, 'pivot-package.json'), '{}')
  const clock = () => new Date('2026-08-20T00:00:00.000Z')
  const registry = new SqliteMarketplaceInstallationRegistryAdapter({ clock, databasePath })
  registries.push(registry)
  const storage = new NodeMarketplaceInstallationStorageAdapter({ installRoot }).openStoragePort()
  const lifecycle = new MarketplaceInstallationLifecycleCoordinator({
    registryReader: registry.openReaderPort(), registryWriter: registry.openWriterPort(), storage,
  })
  return { clock, databasePath, installRoot, lifecycle, registry, sourceRoot, storage }
}

async function createInstalled(fixture: ReturnType<typeof createFixture>, packageIdentity: ReturnType<typeof identity>) {
  const begun = fixture.registry.openWriterPort().begin({
    review: review(packageIdentity), storageKey: fixture.storage.keyFor(packageIdentity),
  })
  const staged = await fixture.storage.stage(stageRequest(fixture, packageIdentity))
  await staged.commit()
  return fixture.registry.openWriterPort().transition({
    expectedRevision: begun.revision, identity: packageIdentity, state: 'installed',
  })
}

function stageRequest(fixture: ReturnType<typeof createFixture>, packageIdentity: ReturnType<typeof identity>) {
  const file = { byteLength: 2, path: 'pivot-package.json', sha256: createHash('sha256').update('{}').digest('hex') }
  return {
    evidence: {
      files: [file],
      inventory: {
        entries: [{ compressedByteLength: 2, kind: 'file' as const, path: file.path, uncompressedByteLength: 2 }],
        schemaVersion: 1 as const, totalCompressedBytes: 2, totalUncompressedBytes: 2,
      },
      schemaVersion: 1 as const, totalBytes: 2,
    },
    identity: packageIdentity,
    sourceRoot: fixture.sourceRoot,
  }
}

function identity(suffix: string) {
  return {
    kind: 'plugin' as const, resourceId: `dev.pivot.${suffix}`, schemaVersion: 1 as const,
    sourceId: 'official', version: '1.0.0',
  }
}

function review(packageIdentity: ReturnType<typeof identity>) {
  return {
    approvedCapabilities: [] as const, declaredCapabilities: [] as const,
    identity: packageIdentity, reviewedAt: '2026-08-20T00:00:00.000Z',
    riskLevel: 'none' as const, schemaVersion: 1 as const, status: 'approved' as const,
  }
}
