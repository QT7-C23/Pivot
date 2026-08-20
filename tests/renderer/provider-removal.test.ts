import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../../src/shared/types/domain'

const providerServiceMock = vi.hoisted(() => ({
  delete: vi.fn<() => Promise<void>>(),
  list: vi.fn(),
  save: vi.fn(),
  setActive: vi.fn(),
  test: vi.fn(),
}))

vi.mock('../../src/renderer/services/provider.service', () => ({ providerService: providerServiceMock }))

import { PROVIDER_REMOVAL_UNDO_MS, useProviderStore } from '../../src/renderer/stores/provider.store'

const provider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1',
  hasApiKey: true,
  id: 'custom-test',
  isActive: false,
  kind: 'custom',
  label: 'Custom Test',
  model: 'test-model',
  updatedAt: '2026-07-26T00:00:00.000Z',
}

describe('provider credential removal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    providerServiceMock.delete.mockReset()
    providerServiceMock.delete.mockResolvedValue()
    useProviderStore.setState({
      configs: [provider],
      error: null,
      isLoading: false,
      pendingRemovals: {},
      testResults: {},
    })
  })

  it('defers the destructive IPC call for the Figma ten-second undo window', async () => {
    await useProviderStore.getState().remove(provider.id)

    expect(useProviderStore.getState().configs).toEqual([])
    expect(useProviderStore.getState().pendingRemovals[provider.id]?.config).toEqual(provider)
    expect(providerServiceMock.delete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(PROVIDER_REMOVAL_UNDO_MS)

    expect(providerServiceMock.delete).toHaveBeenCalledWith(provider.id)
    expect(useProviderStore.getState().pendingRemovals).toEqual({})
  })

  it('restores the provider without deleting its encrypted credential when undone', async () => {
    await useProviderStore.getState().remove(provider.id)
    useProviderStore.getState().undoRemove(provider.id)
    await vi.advanceTimersByTimeAsync(PROVIDER_REMOVAL_UNDO_MS)

    expect(providerServiceMock.delete).not.toHaveBeenCalled()
    expect(useProviderStore.getState().configs).toEqual([provider])
    expect(useProviderStore.getState().pendingRemovals).toEqual({})
  })
})
