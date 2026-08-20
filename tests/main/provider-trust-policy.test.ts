import { describe, expect, it, vi } from 'vitest'
import { createProviderBoundFetch } from '../../src/main/services/provider-trust-policy'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1',
  hasApiKey: true,
  id: 'custom',
  isActive: true,
  kind: 'custom',
  label: 'Custom',
  model: 'model',
  updatedAt: '',
}

describe('provider trust policy', () => {
  it('blocks credential-bearing requests that escape the configured origin or API path', async () => {
    const fetcher = vi.fn()
    const boundFetch = createProviderBoundFetch(provider, fetcher)

    await expect(boundFetch('https://attacker.example.com/v1/models')).rejects.toThrow('escaped its configured trust target')
    await expect(boundFetch('https://api.example.com/admin')).rejects.toThrow('escaped its configured trust target')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('disables redirects for requests inside the configured trust target', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const boundFetch = createProviderBoundFetch(provider, fetcher)

    await boundFetch('https://api.example.com/v1/models', { method: 'GET', redirect: 'follow' })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    )
  })
})
