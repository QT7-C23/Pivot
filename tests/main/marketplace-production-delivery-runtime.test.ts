import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMarketplaceProductionDeliveryRuntime } from '../../src/main/services/marketplace-production-delivery-runtime'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }) })

describe('Marketplace production delivery root ownership', () => {
  it('rejects a Marketplace directory junction that escapes the user-data root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-root-'))
    const outside = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-outside-'))
    roots.push(root, outside)
    mkdirSync(outside, { recursive: true })
    symlinkSync(outside, path.join(root, 'marketplace'), 'junction')
    expect(() => createMarketplaceProductionDeliveryRuntime({
      catalog: null,
      databasePath: path.join(root, 'pivot.sqlite'),
      trustConfig: null,
      userDataPath: root,
    })).toThrow(/symbolic|junction|real directory|owned/i)
    expect(rmSync(path.join(outside, 'staging'), { force: true, recursive: true })).toBeUndefined()
  })
})
