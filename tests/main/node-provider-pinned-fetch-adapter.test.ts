import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { NodeProviderPinnedFetchAdapter } from '../../src/main/services/node-provider-pinned-fetch-adapter'
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

describe('NodeProviderPinnedFetchAdapter', () => {
  it('rejects a hostname that resolves to a private address before sending credentials', async () => {
    const request = vi.fn()
    const adapter = new NodeProviderPinnedFetchAdapter({
      dns: { resolve: vi.fn().mockResolvedValue([{ address: '10.0.0.8', family: 4 }]) },
      requests: { request },
    })

    await expect(adapter.createFetch(provider)('https://api.example.com/v1/models', {
      headers: { Authorization: 'Bearer secret' },
    })).rejects.toThrow('unsafe network address')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects mixed public and private DNS answers instead of selecting the safe-looking one', async () => {
    const request = vi.fn()
    const adapter = new NodeProviderPinnedFetchAdapter({
      dns: {
        resolve: vi.fn().mockResolvedValue([
          { address: '203.0.113.10', family: 4 },
          { address: '192.168.1.20', family: 4 },
        ]),
      },
      requests: { request },
    })

    await expect(adapter.createFetch(provider)('https://api.example.com/v1/models')).rejects.toThrow('unsafe network address')
    expect(request).not.toHaveBeenCalled()
  })

  it('passes one immutable approved DNS binding to the pinned request adapter', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const adapter = new NodeProviderPinnedFetchAdapter({
      dns: {
        resolve: vi.fn().mockResolvedValue([
          { address: '93.184.216.34', family: 4 },
          { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
        ]),
      },
      requests: { request },
    })

    await adapter.createFetch(provider)('https://api.example.com/v1/models', { method: 'GET' })

    expect(request).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
      {
        addresses: [
          { address: '93.184.216.34', family: 4 },
          { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
        ],
        hostname: 'api.example.com',
      },
    )
    const binding = request.mock.calls[0]?.[2]
    expect(Object.isFrozen(binding)).toBe(true)
    expect(Object.isFrozen(binding.addresses)).toBe(true)
  })

  it('does not resolve or permit a different request hostname than the configured provider', async () => {
    const dns = { resolve: vi.fn() }
    const requests = { request: vi.fn() }
    const adapter = new NodeProviderPinnedFetchAdapter({ dns, requests })

    await expect(adapter.createFetch(provider)('https://attacker.example.com/v1/models')).rejects.toThrow('escaped its configured trust target')
    expect(dns.resolve).not.toHaveBeenCalled()
    expect(requests.request).not.toHaveBeenCalled()
  })

  it('uses the approved loopback binding for a real HTTP socket without a second DNS resolution', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address')
    const dns = { resolve: vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 as const }]) }
    const localProvider = { ...provider, baseUrl: `http://localhost:${address.port}/v1` }

    try {
      const response = await new NodeProviderPinnedFetchAdapter({ dns }).createFetch(localProvider)(
        `${localProvider.baseUrl}/models`,
      )
      await expect(response.text()).resolves.toBe('{"ok":true}')
      expect(dns.resolve).toHaveBeenCalledTimes(1)
      expect(dns.resolve).toHaveBeenCalledWith('localhost')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
