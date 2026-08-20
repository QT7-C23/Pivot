import { describe, expect, it } from 'vitest'
import {
  ProviderModelProbeRequestSchema,
  ProviderModelProbeResultSchema,
} from '../../src/shared/provider-model-probe-contracts'

describe('Provider model probe contracts', () => {
  it('accepts a bounded secret-free model projection', () => {
    expect(ProviderModelProbeRequestSchema.parse({ providerId: 'openai' })).toEqual({
      forceRefresh: false,
      providerId: 'openai',
    })
    expect(ProviderModelProbeResultSchema.parse({
      available: true,
      cacheState: 'refreshed',
      expiresAt: '2026-08-13T12:05:00.000Z',
      models: ['review-a', 'review-b'],
      probedAt: '2026-08-13T12:00:00.000Z',
      providerId: 'openai',
      schemaVersion: 1,
      truncated: false,
      unavailableReason: null,
    }).models).toEqual(['review-a', 'review-b'])
  })

  it('rejects privileged selectors, oversized output and inconsistent states', () => {
    expect(ProviderModelProbeRequestSchema.safeParse({ apiKey: 'secret', providerId: 'openai' }).success).toBe(false)
    expect(ProviderModelProbeResultSchema.safeParse({
      available: true,
      cacheState: 'refreshed',
      expiresAt: null,
      models: [],
      probedAt: null,
      providerId: 'openai',
      schemaVersion: 1,
      truncated: false,
      unavailableReason: null,
    }).success).toBe(false)
    expect(ProviderModelProbeResultSchema.safeParse({
      available: true,
      cacheState: 'refreshed',
      expiresAt: '2026-08-13T12:05:00.000Z',
      models: Array.from({ length: 101 }, (_, index) => `model-${index}`),
      probedAt: '2026-08-13T12:00:00.000Z',
      providerId: 'openai',
      schemaVersion: 1,
      truncated: false,
      unavailableReason: null,
    }).success).toBe(false)
  })
})
