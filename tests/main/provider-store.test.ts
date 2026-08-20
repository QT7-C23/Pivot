import { describe, expect, it, vi } from 'vitest'
import { ProviderStore } from '../../src/main/services/provider-store'
import { testProviderConnection } from '../../src/main/services/provider-connection'

const cipher = {
  decrypt: (value: string) => value.replace('encrypted:', ''),
  encrypt: (value: string) => `encrypted:${value}`,
}

describe('ProviderStore', () => {
  it('never exposes the stored API key through provider configuration', () => {
    const providers = new ProviderStore(cipher)
    const saved = providers.save({ apiKey: 'sk-secret', baseUrl: 'https://api.example.com/v1/', id: 'provider-1', kind: 'custom', label: 'Example', model: 'model-1' })

    expect(saved).toMatchObject({ baseUrl: 'https://api.example.com/v1', hasApiKey: true })
    expect(JSON.stringify(providers.list())).not.toContain('sk-secret')
    expect(providers.readSecret(saved.id)).toBe('sk-secret')
  })

  it('tests connections with the decrypted key but returns only status metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await testProviderConnection({ baseUrl: 'https://api.openai.com/v1', hasApiKey: true, id: 'p', isActive: false, kind: 'openai', label: 'P', model: 'm', updatedAt: '' }, 'sk-secret', fetcher)

    expect(fetcher).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer sk-secret' },
      redirect: 'error',
    }))
    expect(result).toMatchObject({ message: 'Connection succeeded', ok: true, status: 200 })
    expect(JSON.stringify(result)).not.toContain('sk-secret')
  })

  it('does not activate a provider without a stored credential', () => {
    const providers = new ProviderStore(cipher)
    providers.save({ baseUrl: 'https://api.example.com/v1', id: 'provider-1', kind: 'custom', label: 'Example', model: 'model-1' })
    expect(() => providers.setActive('provider-1')).toThrow('Configure an API key')
  })

  it('does not delete the active provider', () => {
    const providers = new ProviderStore(cipher)
    providers.save({ apiKey: 'sk-active', baseUrl: 'https://api.example.com/v1', id: 'provider-1', kind: 'custom', label: 'Example', model: 'model-1' })
    providers.setActive('provider-1')

    expect(() => providers.delete('provider-1')).toThrow('Active provider cannot be deleted')
    expect(providers.get('provider-1')).toMatchObject({ isActive: true })
  })

  it('requires a new credential when the provider trust target changes', () => {
    const providers = new ProviderStore(cipher)
    providers.save({ apiKey: 'sk-original', baseUrl: 'https://first.example.com/v1', id: 'provider-1', kind: 'custom', label: 'Example', model: 'model-1' })

    expect(() => providers.save({
      baseUrl: 'https://second.example.com/v1',
      id: 'provider-1',
      kind: 'custom',
      label: 'Example',
      model: 'model-1',
    })).toThrow('new API key')
    expect(providers.get('provider-1')).toMatchObject({ baseUrl: 'https://first.example.com/v1' })
    expect(providers.readSecret('provider-1')).toBe('sk-original')

    providers.save({ apiKey: 'sk-rebound', baseUrl: 'https://second.example.com/v1', id: 'provider-1', kind: 'custom', label: 'Example', model: 'model-1' })
    expect(providers.readSecret('provider-1')).toBe('sk-rebound')
  })

  it('keeps built-in providers on code-owned official endpoints', () => {
    const providers = new ProviderStore(cipher)

    expect(() => providers.save({
      apiKey: 'sk-secret',
      baseUrl: 'https://attacker.example.com/v1',
      id: 'openai',
      kind: 'openai',
      label: 'OpenAI',
      model: 'gpt-5',
    })).toThrow('official endpoint')
    expect(providers.list()).toEqual([])
  })

  it.each([
    'http://example.com/v1',
    'https://user:password@example.com/v1',
    'https://example.com/v1#fragment',
    'https://10.0.0.1/v1',
    'https://169.254.169.254/latest',
    'https://[fe80::1]/v1',
    'https://metadata.google.internal/v1',
  ])('rejects unsafe custom provider endpoint %s', (baseUrl) => {
    const providers = new ProviderStore(cipher)

    expect(() => providers.save({
      apiKey: 'sk-secret',
      baseUrl,
      id: 'custom',
      kind: 'custom',
      label: 'Custom',
      model: 'model',
    })).toThrow('Provider endpoint')
  })

  it('allows explicit HTTP only for a loopback custom provider', () => {
    const providers = new ProviderStore(cipher)

    expect(providers.save({
      apiKey: 'local-secret',
      baseUrl: 'http://127.0.0.1:11434/v1/',
      id: 'local',
      kind: 'custom',
      label: 'Local',
      model: 'model',
    })).toMatchObject({ baseUrl: 'http://127.0.0.1:11434/v1' })
  })
})
