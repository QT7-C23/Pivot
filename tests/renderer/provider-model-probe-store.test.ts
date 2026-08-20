import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.stubGlobal('window', { pivot: { invoke } })
import { useProviderModelProbeStore } from '../../src/renderer/stores/provider-model-probe.store'

beforeEach(() => {
  invoke.mockReset()
  useProviderModelProbeStore.setState({ errors: {}, loading: {}, results: {} })
})

describe('Provider model probe store', () => {
  it('strictly validates results and ignores stale responses for the same provider', async () => {
    let resolveFirst!: (value: unknown) => void
    invoke.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(result('p1', ['new']))
    const first = useProviderModelProbeStore.getState().probe('p1', false)
    await useProviderModelProbeStore.getState().probe('p1', true)
    resolveFirst(result('p1', ['old']))
    await first
    expect(useProviderModelProbeStore.getState().results.p1?.models).toEqual(['new'])
  })

  it('rejects privileged-looking malformed responses without preserving prior data', async () => {
    invoke.mockResolvedValue({ ...result('p1', ['review']), apiKey: 'secret' })
    await useProviderModelProbeStore.getState().probe('p1', false)
    expect(useProviderModelProbeStore.getState().results.p1).toBeUndefined()
    expect(useProviderModelProbeStore.getState().errors.p1).toMatch(/invalid/i)
  })

  it('rejects a valid response owned by a different provider', async () => {
    invoke.mockResolvedValue(result('p2', ['review']))
    await useProviderModelProbeStore.getState().probe('p1', false)
    expect(useProviderModelProbeStore.getState().results.p1).toBeUndefined()
    expect(useProviderModelProbeStore.getState().errors.p1).toMatch(/provider|owner|match/i)
  })
})

function result(providerId: string, models: string[]) {
  return {
    available: true, cacheState: 'refreshed', expiresAt: '2026-08-13T12:05:00.000Z',
    models, probedAt: '2026-08-13T12:00:00.000Z', providerId, schemaVersion: 1,
    truncated: false, unavailableReason: null,
  }
}
