import { describe, expect, it } from 'vitest'
import { MarketplaceUpdateCoordinator } from '../../src/main/services/marketplace-update-coordinator'
import type { MarketplacePackageArtifactIdentity } from '../../src/shared/marketplace-contracts'
import type { MarketplaceInstallationRecord } from '../../src/shared/marketplace-installation-contracts'
import type { MarketplaceBoundPackagePort } from '../../src/main/services/marketplace-package-binding-ports'
import type { MarketplaceCapabilityReviewEvidence } from '../../src/shared/marketplace-capability-contracts'
import type { MarketplaceUpdateRecord } from '../../src/shared/marketplace-update-contracts'

describe('Marketplace two-phase update coordinator', () => {
  it('switches to a verified newer installation while retaining the old rollback version', async () => {
    const fixture = createFixture()
    const record = await fixture.port.stage({
      currentIdentity: fixture.current.identity,
      expectedCurrentRevision: fixture.current.revision,
    }, fixture.bound, fixture.review)
    expect(record).toMatchObject({ state: 'ready' })
    expect(fixture.actions).toEqual(['install:1.1.0', 'switch:1.1.0:1'])
    expect(fixture.records.has(key(fixture.current.identity))).toBe(true)
    expect(fixture.records.has(key(fixture.candidate.identity))).toBe(true)
  })

  it('stages an already delivered and activated candidate without reinstalling it', async () => {
    const fixture = createFixture()
    fixture.records.set(key(fixture.candidate.identity), fixture.candidate)
    const record = await fixture.port.stageInstalled({
      candidateIdentity: fixture.candidate.identity,
      expectedCandidateRevision: fixture.candidate.revision,
      currentIdentity: fixture.current.identity,
      expectedCurrentRevision: fixture.current.revision,
    })
    expect(record.state).toBe('ready')
    expect(fixture.actions).toEqual(['switch:1.1.0:1'])
  })

  it('rolls back the candidate if the version switch fails', async () => {
    const fixture = createFixture({ switchFailure: true })
    await expect(fixture.port.stage({
      currentIdentity: fixture.current.identity,
      expectedCurrentRevision: fixture.current.revision,
    }, fixture.bound, fixture.review)).rejects.toThrow(/switch failure/i)
    expect(fixture.actions).toEqual(['install:1.1.0', 'switch:1.1.0:1', 'uninstall:1.1.0:1'])
    expect(fixture.records.has(key(fixture.candidate.identity))).toBe(false)
    expect(fixture.records.has(key(fixture.current.identity))).toBe(true)
  })

  it('can roll back before finalization or finalize by deleting only the old version', async () => {
    const rollbackFixture = createFixture()
    const rollbackReady = await rollbackFixture.port.stage({
      currentIdentity: rollbackFixture.current.identity,
      expectedCurrentRevision: 1,
    }, rollbackFixture.bound, rollbackFixture.review)
    const rolledBack = await rollbackFixture.port.rollback(rollbackReady.updateId, rollbackReady.revision)
    expect(rolledBack.state).toBe('rolled-back')
    expect(rollbackFixture.actions.slice(-2)).toEqual(['switch:1.0.0:1', 'uninstall:1.1.0:1'])

    const finalizeFixture = createFixture()
    const finalizeReady = await finalizeFixture.port.stage({
      currentIdentity: finalizeFixture.current.identity,
      expectedCurrentRevision: 1,
    }, finalizeFixture.bound, finalizeFixture.review)
    const finalized = await finalizeFixture.port.finalize(finalizeReady.updateId, finalizeReady.revision)
    expect(finalized.state).toBe('finalized')
    expect(finalizeFixture.actions.at(-1)).toBe('uninstall:1.0.0:1')
  })

  it('rejects stale or cross-resource updates before installing anything', async () => {
    const fixture = createFixture()
    await expect(fixture.port.stage({
      currentIdentity: fixture.current.identity,
      expectedCurrentRevision: 0,
    }, fixture.bound, fixture.review)).rejects.toThrow(/revision|stale/i)
    const wrong = { manifest: { identity: { ...fixture.candidate.identity, resourceId: 'other' } } } as unknown as MarketplaceBoundPackagePort
    await expect(fixture.port.stage({
      currentIdentity: fixture.current.identity,
      expectedCurrentRevision: 1,
    }, wrong, { ...fixture.review, identity: wrong.manifest.identity } as MarketplaceCapabilityReviewEvidence)).rejects.toThrow(/same resource/i)
    expect(fixture.actions).toEqual([])
  })
})

function createFixture(options: { switchFailure?: boolean } = {}) {
  const current = installed(identity('1.0.0'))
  const candidate = installed(identity('1.1.0'))
  const records = new Map([[key(current.identity), current]])
  const actions: string[] = []
  const updates = new Map<string, MarketplaceUpdateRecord>()
  const bound = { manifest: { identity: candidate.identity } } as unknown as MarketplaceBoundPackagePort
  const review = { identity: candidate.identity } as MarketplaceCapabilityReviewEvidence
  const coordinator = new MarketplaceUpdateCoordinator({
    installation: {
      install: async () => {
        actions.push('install:1.1.0')
        records.set(key(candidate.identity), candidate)
        return candidate
      },
    },
    installations: {
      get: (packageIdentity) => records.get(key(packageIdentity)) ?? null,
      listInstalled: () => [...records.values()],
      listRecoverable: () => [],
    },
    lifecycle: {
      uninstall: async (packageIdentity, revision) => {
        actions.push(`uninstall:${packageIdentity.version}:${revision}`)
        records.delete(key(packageIdentity))
      },
    },
    switches: {
      switchTo: async (packageIdentity, revision) => {
        actions.push(`switch:${packageIdentity.version}:${revision}`)
        if (options.switchFailure && packageIdentity.version === '1.1.0') throw new Error('injected switch failure')
      },
    },
    updates: {
      begin: (input) => {
        const record: MarketplaceUpdateRecord = { ...input, createdAt: '2026-08-20T00:00:00.000Z', revision: 0, schemaVersion: 1, state: 'ready', updateId: 'update-1', updatedAt: '2026-08-20T00:00:00.000Z' }
        updates.set(record.updateId, record)
        return record
      },
      find: (updateId) => updates.get(updateId) ?? null,
      listReady: () => [...updates.values()].filter((item) => item.state === 'ready'),
      transition: ({ expectedRevision, state, updateId }) => {
        const currentUpdate = updates.get(updateId)
        if (!currentUpdate || currentUpdate.revision !== expectedRevision) throw new Error('stale update')
        const next = { ...currentUpdate, revision: expectedRevision + 1, state }
        updates.set(updateId, next)
        return next
      },
    },
  })
  return { actions, bound, candidate, current, port: coordinator.openUpdatePort(), records, review }
}

function identity(version: string): MarketplacePackageArtifactIdentity {
  return { kind: 'theme', resourceId: 'dev.pivot.theme', schemaVersion: 1, sourceId: 'official', version }
}

function installed(packageIdentity: MarketplacePackageArtifactIdentity): MarketplaceInstallationRecord {
  return { capabilities: [], createdAt: '2026-08-20T00:00:00.000Z', identity: packageIdentity, revision: 1, schemaVersion: 1, state: 'installed', storageKey: 'a'.repeat(64), updatedAt: '2026-08-20T00:00:00.000Z' }
}

function key(packageIdentity: MarketplacePackageArtifactIdentity): string { return JSON.stringify(packageIdentity) }
