import { describe, expect, it } from 'vitest'
import { MarketplacePackageUpdateWorkflow } from '../../src/main/services/marketplace-package-update-workflow'

const current = { kind: 'theme' as const, resourceId: 'ocean', schemaVersion: 1 as const, sourceId: 'official', version: '1.0.0' }
const candidate = { ...current, version: '1.1.0' }

describe('MarketplacePackageUpdateWorkflow', () => {
  it('delivers, activates, and stages a candidate before returning ready evidence', async () => {
    const actions: string[] = []
    const workflow = new MarketplacePackageUpdateWorkflow({
      activation: { activate: async () => { actions.push('activate'); return active(candidate) }, deactivate: async () => undefined },
      activations: { get: (identity) => identity.version === '1.0.0' ? active(current) : null, listActive: () => [] },
      delivery: { install: async () => { actions.push('install'); return { installation: installed(candidate), status: 'installed' } } },
      lifecycle: { uninstall: async () => { actions.push('uninstall') } },
      updates: {
        finalize: async () => update('finalized'), rollback: async () => update('rolled-back'),
        stage: async () => { throw new Error('not used') },
        stageInstalled: async () => { actions.push('stage'); return update('ready') },
      },
      evidence: { begin: () => update('ready'), find: () => update('ready'), listReady: () => [update('ready')], transition: () => update('ready') },
    })
    await expect(workflow.openPort().update(request())).resolves.toMatchObject({ status: 'ready' })
    expect(actions).toEqual(['install', 'activate', 'stage'])
    expect(workflow.openPort().list()).toMatchObject({ items: [{ state: 'ready' }] })
  })

  it('cleans activation and installation if staging fails', async () => {
    const actions: string[] = []
    const workflow = new MarketplacePackageUpdateWorkflow({
      activation: { activate: async () => active(candidate), deactivate: async () => { actions.push('deactivate') } },
      activations: { get: (identity) => identity.version === '1.0.0' ? active(current) : null, listActive: () => [] },
      delivery: { install: async () => ({ installation: installed(candidate), status: 'installed' }) },
      lifecycle: { uninstall: async () => { actions.push('uninstall') } },
      updates: { finalize: async () => update('finalized'), rollback: async () => update('rolled-back'), stage: async () => { throw new Error('unused') }, stageInstalled: async () => { throw new Error('switch failed') } },
      evidence: { begin: () => update('ready'), find: () => null, listReady: () => [], transition: () => update('ready') },
    })
    await expect(workflow.openPort().update(request())).rejects.toThrow('switch failed')
    expect(actions).toEqual(['deactivate', 'uninstall'])
  })
})

function request() { return { approvedCapabilities: [], currentIdentity: current, expectedCatalogRevision: 1, expectedCurrentRevision: 1, kind: 'theme' as const, resourceId: 'ocean', sourceId: 'official' } }
function installed(identity: typeof current) { return { capabilities: [], identity, revision: 1, state: 'installed' as const } }
function active(identity: typeof current) { return { activatedAt: '2026-08-21T00:00:00.000Z', capabilities: [], identity, installationRevision: 1, registrationId: `registration-${identity.version}`, revision: 0, schemaVersion: 1 as const, state: 'active' as const } }
function update(state: 'finalized' | 'ready' | 'rolled-back') { return { candidate: { identity: candidate, installationRevision: 1 }, createdAt: '2026-08-21T00:00:00.000Z', current: { identity: current, installationRevision: 1 }, revision: state === 'ready' ? 0 : 1, schemaVersion: 1 as const, state, updateId: 'update-1', updatedAt: '2026-08-21T00:00:00.000Z' } }
