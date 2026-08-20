import { describe, expect, it, vi } from 'vitest'
import { ProviderModelProbeService } from '../../src/main/services/provider-model-probe-service'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.openai.com/v1', hasApiKey: true, id: 'p1', isActive: true,
  kind: 'openai', label: 'OpenAI', model: 'worker', updatedAt: '2026-08-13T00:00:00.000Z',
}

describe('ProviderModelProbeService', () => {
  it('coalesces concurrent probes, serves TTL hits and refreshes after provider changes', async () => {
    let now = Date.parse('2026-08-13T12:00:00.000Z')
    let resolve!: (value: { models: string[]; truncated: boolean }) => void
    const probe = vi.fn(() => new Promise<{ models: string[]; truncated: boolean }>((done) => { resolve = done }))
    const configs = new Map([['p1', provider]])
    const service = new ProviderModelProbeService({
      clock: () => now,
      configuration: { get: (id) => configs.get(id) ?? null, readSecret: () => 'secret' },
      probe: { probe },
      ttlMs: 1_000,
    })
    const first = service.query({ forceRefresh: false, providerId: 'p1' })
    const concurrent = service.query({ forceRefresh: false, providerId: 'p1' })
    expect(probe).toHaveBeenCalledTimes(1)
    resolve({ models: ['review'], truncated: false })
    await expect(first).resolves.toMatchObject({ cacheState: 'refreshed', models: ['review'] })
    await expect(concurrent).resolves.toMatchObject({ cacheState: 'refreshed', models: ['review'] })
    await expect(service.query({ forceRefresh: false, providerId: 'p1' })).resolves.toMatchObject({ cacheState: 'hit' })
    expect(probe).toHaveBeenCalledTimes(1)

    now += 500
    configs.set('p1', { ...provider, updatedAt: '2026-08-13T12:00:00.500Z' })
    probe.mockResolvedValueOnce({ models: ['review-2'], truncated: false })
    await expect(service.query({ forceRefresh: false, providerId: 'p1' })).resolves.toMatchObject({
      cacheState: 'refreshed', models: ['review-2'],
    })
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('returns stale successful evidence after refresh failure without caching a failure', async () => {
    let now = Date.parse('2026-08-13T12:00:00.000Z')
    const probe = vi.fn().mockResolvedValueOnce({ models: ['review'], truncated: false })
    const service = new ProviderModelProbeService({
      clock: () => now,
      configuration: { get: () => provider, readSecret: () => 'secret' },
      probe: { probe }, ttlMs: 10,
    })
    await service.query({ forceRefresh: false, providerId: 'p1' })
    now += 20
    probe.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ models: ['review-2'], truncated: false })
    await expect(service.query({ forceRefresh: false, providerId: 'p1' })).resolves.toMatchObject({ cacheState: 'stale', models: ['review'] })
    await expect(service.query({ forceRefresh: true, providerId: 'p1' })).resolves.toMatchObject({ cacheState: 'refreshed', models: ['review-2'] })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('fails closed for missing/unconfigured providers and an initial probe failure', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('offline'))
    const configuration = { get: vi.fn<(id: string) => ProviderConfig | null>(), readSecret: vi.fn() }
    const service = new ProviderModelProbeService({ configuration, probe: { probe } })
    configuration.get.mockReturnValueOnce(null).mockReturnValueOnce({ ...provider, hasApiKey: false }).mockReturnValue(provider)
    await expect(service.query({ providerId: 'missing', forceRefresh: false })).resolves.toMatchObject({ available: false, unavailableReason: 'not-configured' })
    await expect(service.query({ providerId: 'p1', forceRefresh: false })).resolves.toMatchObject({ available: false, unavailableReason: 'not-configured' })
    await expect(service.query({ providerId: 'p1', forceRefresh: false })).resolves.toMatchObject({ available: false, unavailableReason: 'probe-failed' })
    expect(configuration.readSecret).toHaveBeenCalledTimes(1)
  })
})
