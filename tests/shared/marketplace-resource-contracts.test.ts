import { describe, expect, it } from 'vitest'
import {
  MarketplaceActiveResourceCollectionSchema,
  MarketplaceDataResourceSchema,
  MarketplacePluginInvocationRequestSchema,
  MarketplacePluginInvocationResultSchema,
} from '../../src/shared/marketplace-resource-contracts'

describe('Marketplace resource contracts', () => {
  it('strictly validates prompt, skill, and semantic theme resources', () => {
    expect(MarketplaceDataResourceSchema.parse({
      content: 'Review changes before editing.', id: 'review', kind: 'prompt', schemaVersion: 1, title: 'Review',
    }).kind).toBe('prompt')
    expect(MarketplaceDataResourceSchema.parse({
      id: 'testing', instructions: 'Run focused tests first.', kind: 'skill', name: 'Testing', schemaVersion: 1,
      triggers: ['test', 'regression'],
    }).kind).toBe('skill')
    expect(MarketplaceDataResourceSchema.parse({
      id: 'ocean', kind: 'theme', name: 'Ocean', schemaVersion: 1,
      tokens: { accentDefault: '#19766f', backgroundCanvas: '#f3f1ec', textPrimary: '#1c201f' },
    }).kind).toBe('theme')
  })

  it('rejects unknown fields and unsafe CSS token values', () => {
    expect(() => MarketplaceDataResourceSchema.parse({
      content: 'x', extra: true, id: 'x', kind: 'prompt', schemaVersion: 1, title: 'X',
    })).toThrow()
    expect(() => MarketplaceDataResourceSchema.parse({
      id: 'bad', kind: 'theme', name: 'Bad', schemaVersion: 1,
      tokens: { accentDefault: 'url(https://attacker.invalid)' },
    })).toThrow()
  })

  it('keeps public active-resource and plugin invocation payloads bounded', () => {
    expect(() => MarketplaceActiveResourceCollectionSchema.parse({ items: [{ kind: 'prompt' }], schemaVersion: 1 })).toThrow()
    expect(() => MarketplacePluginInvocationRequestSchema.parse({ registrationId: '../escape' })).toThrow()
    expect(MarketplacePluginInvocationResultSchema.parse({ emittedCodes: [7], resultCode: 0, schemaVersion: 1 })).toEqual({
      emittedCodes: [7], resultCode: 0, schemaVersion: 1,
    })
  })
})
