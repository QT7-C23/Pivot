import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteMarketplaceUpdateRegistryAdapter } from '../../src/main/services/sqlite-marketplace-update-registry-adapter'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }) })

describe('Marketplace update evidence registry', () => {
  it('persists ready evidence across restart and enforces optimistic transition revision', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pivot-update-registry-'))
    roots.push(root)
    const databasePath = path.join(root, 'updates.sqlite')
    const options = { clock: () => new Date('2026-08-20T00:00:00.000Z'), databasePath, idFactory: () => 'update-1' }
    const first = new SqliteMarketplaceUpdateRegistryAdapter(options)
    const ready = first.openPort().begin({
      candidate: { identity: identity('1.1.0'), installationRevision: 1 },
      current: { identity: identity('1.0.0'), installationRevision: 1 },
    })
    first.close()

    const reopened = new SqliteMarketplaceUpdateRegistryAdapter(options)
    expect(reopened.openPort().find(ready.updateId)).toEqual(ready)
    expect(() => reopened.openPort().transition({ expectedRevision: 1, state: 'finalized', updateId: ready.updateId }))
      .toThrow(/revision|stale/i)
    expect(reopened.openPort().transition({ expectedRevision: 0, state: 'finalized', updateId: ready.updateId }))
      .toMatchObject({ revision: 1, state: 'finalized' })
    reopened.close()
  })
})

function identity(version: string) {
  return { kind: 'theme' as const, resourceId: 'dev.pivot.theme', schemaVersion: 1 as const, sourceId: 'official', version }
}
