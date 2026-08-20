import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketplaceActivationCoordinator } from '../../src/main/services/marketplace-activation-coordinator'
import { SqliteMarketplaceActivationRegistryAdapter } from '../../src/main/services/sqlite-marketplace-activation-registry-adapter'
import type {
  MarketplaceInstalledPackageReaderPort,
  MarketplaceResourceRegistrationPort,
} from '../../src/main/services/marketplace-activation-ports'
import type { MarketplaceInstallationRegistryReaderPort } from '../../src/main/services/marketplace-installation-ports'

const roots: string[] = []
const registries: SqliteMarketplaceActivationRegistryAdapter[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) {
    try { registry.close() } catch { /* restart test */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace activation foundation', () => {
  it('activates only an installed revision through narrow Ports and persists evidence', async () => {
    const fixture = createFixture('skill')
    const record = await fixture.activation.activate({
      expectedInstallationRevision: 2,
      identity: fixture.identity,
    })
    expect(record).toMatchObject({ installationRevision: 2, revision: 0, state: 'active' })
    expect(fixture.registered).toEqual([expect.objectContaining({
      capabilities: ['workspace.read'], entrypoint: 'SKILL.md', identity: fixture.identity, installationRevision: 2,
    })])

    fixture.registry.close()
    const reopened = new SqliteMarketplaceActivationRegistryAdapter({ databasePath: fixture.databasePath })
    registries.push(reopened)
    expect(reopened.openReaderPort().get(fixture.identity)).toEqual(record)
  })

  it('rejects stale installation authority before resource registration', async () => {
    const fixture = createFixture('prompt')
    await expect(fixture.activation.activate({
      expectedInstallationRevision: 1,
      identity: fixture.identity,
    })).rejects.toThrow(/revision|stale/i)
    expect(fixture.registered).toEqual([])
    expect(fixture.registry.openReaderPort().get(fixture.identity)).toBeNull()
  })

  it('delegates plugin activation to the isolated registration Port', async () => {
    const fixture = createFixture('plugin')
    await expect(fixture.activation.activate({
      expectedInstallationRevision: 2,
      identity: fixture.identity,
    })).resolves.toMatchObject({ state: 'active' })
    expect(fixture.registered).toHaveLength(1)
  })

  it('deactivates an exact activation revision and restores persisted registrations', async () => {
    const fixture = createFixture('theme')
    const active = await fixture.activation.activate({ expectedInstallationRevision: 2, identity: fixture.identity })
    await fixture.activation.deactivate({ expectedActivationRevision: active.revision, identity: fixture.identity })
    expect(fixture.unregistered).toEqual(['registration-1'])
    expect(fixture.registry.openReaderPort().get(fixture.identity)).toBeNull()

    const restored = createFixture('prompt')
    await restored.activation.activate({ expectedInstallationRevision: 2, identity: restored.identity })
    restored.registered.splice(0)
    await restored.recovery.restore()
    expect(restored.registered).toHaveLength(1)
  })

  it('rolls back runtime registration if activation evidence cannot commit', async () => {
    const fixture = createFixture('theme')
    const registrations: MarketplaceResourceRegistrationPort = {
      register: fixture.registrations.register,
      unregister: async (registrationId) => { fixture.unregistered.push(registrationId) },
    }
    const activation = new MarketplaceActivationCoordinator({
      installations: fixture.installations,
      packages: fixture.packages,
      registrations,
      registryReader: fixture.registry.openReaderPort(),
      registryWriter: {
        activate: () => { throw new Error('injected evidence failure') },
        deactivate: () => undefined,
      },
    }).openActivationPort()
    await expect(activation.activate({
      expectedInstallationRevision: 2,
      identity: fixture.identity,
    })).rejects.toThrow(/evidence failure/i)
    expect(fixture.unregistered).toEqual(['registration-1'])
  })
})

function createFixture(kind: 'plugin' | 'prompt' | 'skill' | 'theme') {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-activation-'))
  roots.push(root)
  const databasePath = path.join(root, 'activation.sqlite')
  const identity = {
    kind,
    resourceId: `dev.pivot.${kind}`,
    schemaVersion: 1 as const,
    sourceId: 'official',
    version: '1.0.0',
  }
  const capabilities = kind === 'skill' ? ['workspace.read' as const] : []
  const entrypoint = kind === 'skill' ? 'SKILL.md' : kind === 'theme' ? 'theme.json' : 'prompt.md'
  const installations: MarketplaceInstallationRegistryReaderPort = {
    get: () => ({
      capabilities,
      createdAt: '2026-08-20T00:00:00.000Z',
      identity,
      revision: 2,
      schemaVersion: 1,
      state: 'installed',
      storageKey: 'a'.repeat(64),
      updatedAt: '2026-08-20T00:00:00.000Z',
    }),
    listInstalled: () => [],
    listRecoverable: () => [],
  }
  const packages: MarketplaceInstalledPackageReaderPort = {
    readManifest: async () => ({
      capabilities,
      entrypoint,
      files: [{ byteLength: 1, path: entrypoint, sha256: 'b'.repeat(64) }],
      identity,
      publisherId: 'pivot-labs',
      schemaVersion: 1,
    }),
    readResource: async () => kind === 'plugin'
      ? ({ bytes: Uint8Array.of(0), kind: 'plugin' as const })
      : kind === 'prompt'
        ? ({ content: 'Prompt', id: identity.resourceId, kind, schemaVersion: 1 as const, title: 'Prompt' })
        : kind === 'skill'
          ? ({ id: identity.resourceId, instructions: 'Skill', kind, name: 'Skill', schemaVersion: 1 as const, triggers: [] })
          : ({ id: identity.resourceId, kind, name: 'Theme', schemaVersion: 1 as const, tokens: { accentDefault: '#19766f' } }),
  }
  const registered: unknown[] = []
  const unregistered: string[] = []
  const registrations: MarketplaceResourceRegistrationPort = {
    register: async (request) => {
      registered.push(request)
      return Object.freeze({ registrationId: 'registration-1' })
    },
    unregister: async (registrationId) => { unregistered.push(registrationId) },
  }
  const registry = new SqliteMarketplaceActivationRegistryAdapter({
    clock: () => new Date('2026-08-20T00:00:00.000Z'),
    databasePath,
  })
  registries.push(registry)
  const coordinator = new MarketplaceActivationCoordinator({
    installations,
    packages,
    registrations,
    registryReader: registry.openReaderPort(),
    registryWriter: registry.openWriterPort(),
  })
  const activation = coordinator.openActivationPort()
  const recovery = coordinator.openRecoveryPort()
  return {
    activation, databasePath, identity, installations, packages, registered,
    recovery, registrations, registry, unregistered,
  }
}
