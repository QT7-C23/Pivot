import { describe, expect, it } from 'vitest'
import { MarketplaceCatalogReadResultSchema } from '../../src/shared/marketplace-contracts'
import { validateIpcRequest } from '../../src/shared/ipc-validation'

describe('Marketplace renderer boundary contracts', () => {
  it('represents an unconfigured or failed catalog explicitly', () => {
    expect(MarketplaceCatalogReadResultSchema.parse({
      reason: 'unconfigured',
      status: 'unavailable',
    })).toEqual({ reason: 'unconfigured', status: 'unavailable' })
    const failed = MarketplaceCatalogReadResultSchema.parse({
      message: 'Catalog request timed out',
      reason: 'read-failed',
      status: 'unavailable',
    })
    expect(failed).toMatchObject({ reason: 'read-failed', status: 'unavailable' })
    expect(() => MarketplaceCatalogReadResultSchema.parse({
      reason: 'unconfigured',
      status: 'unavailable',
      snapshot: { forged: true },
    })).toThrow()
  })

  it('validates narrow catalog, favorite and delivery IPC requests', () => {
    expect(validateIpcRequest('marketplace:catalog', undefined)).toBeUndefined()
    expect(validateIpcRequest('marketplace:favorites', undefined)).toBeUndefined()
    expect(validateIpcRequest('marketplace:set-favorite', {
      expectedRevision: 2,
      favorite: true,
      kind: 'skill',
      resourceId: 'dev.pivot.review',
      sourceId: 'official',
    })).toMatchObject({ favorite: true, resourceId: 'dev.pivot.review' })
    expect(() => validateIpcRequest('marketplace:set-favorite', {
      databasePath: 'D:\\forged.sqlite',
      expectedRevision: 2,
      favorite: true,
      kind: 'skill',
      resourceId: 'dev.pivot.review',
      sourceId: 'official',
    })).toThrow(/unknown field/i)
    expect(validateIpcRequest('marketplace:installations', undefined)).toBeUndefined()
    expect(validateIpcRequest('marketplace:install', {
      approvedCapabilities: ['workspace.read'], expectedCatalogRevision: 4,
      kind: 'skill', resourceId: 'dev.pivot.review', sourceId: 'official',
    })).toMatchObject({ expectedCatalogRevision: 4 })
    expect(() => validateIpcRequest('marketplace:install', {
      approvedCapabilities: [], expectedCatalogRevision: 4, kind: 'skill',
      resourceId: 'dev.pivot.review', rootPath: 'D:/forged', sourceId: 'official',
    })).toThrow(/unknown field/i)
  })
})
