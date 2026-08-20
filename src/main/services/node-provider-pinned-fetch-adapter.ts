import { lookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import type { ProviderConfig } from '../../shared/types/domain'
import type {
  ProviderDnsResolutionPort,
  ProviderPinnedBinding,
  ProviderPinnedRequestPort,
  ProviderResolvedAddress,
} from './provider-network-ports'
import {
  createProviderBoundFetch,
  isProviderNetworkAddressAllowed,
  validateAndNormalizeProviderEndpoint,
} from './provider-trust-policy'

export class NodeProviderDnsResolutionAdapter implements ProviderDnsResolutionPort {
  async resolve(hostname: string): Promise<readonly ProviderResolvedAddress[]> {
    const version = isIP(hostname)
    if (version === 4 || version === 6) {
      return Object.freeze([{ address: hostname, family: version }])
    }
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    return Object.freeze(addresses.map(({ address, family }) => Object.freeze({
      address,
      family: family as 4 | 6,
    })))
  }
}

export class UndiciProviderPinnedRequestAdapter implements ProviderPinnedRequestPort {
  async request(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    binding: ProviderPinnedBinding,
  ): Promise<Response> {
    const dispatcher = new Agent({
      connect: { lookup: createPinnedLookup(binding) },
    })
    try {
      const response = await undiciFetch(input as never, {
        ...(init ?? {}),
        dispatcher,
        redirect: 'error',
      } as never)
      return wrapResponseWithDispatcherLifetime(response as Response, dispatcher)
    } catch (error) {
      await dispatcher.close()
      throw error
    }
  }
}

export class NodeProviderPinnedFetchAdapter {
  private readonly dns: ProviderDnsResolutionPort
  private readonly requests: ProviderPinnedRequestPort

  constructor(options: {
    dns?: ProviderDnsResolutionPort
    requests?: ProviderPinnedRequestPort
  } = {}) {
    this.dns = options.dns ?? new NodeProviderDnsResolutionAdapter()
    this.requests = options.requests ?? new UndiciProviderPinnedRequestAdapter()
  }

  createFetch(provider: ProviderConfig): typeof fetch {
    const endpoint = new URL(validateAndNormalizeProviderEndpoint(provider.kind, provider.baseUrl))
    const allowLoopback = endpoint.protocol === 'http:' || isLoopbackHostname(endpoint.hostname)
    const networkFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const target = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      const resolved = await this.dns.resolve(target.hostname)
      if (resolved.length === 0) throw new Error('Provider hostname resolved to no network addresses')
      if (resolved.some(({ address }) => !isProviderNetworkAddressAllowed(address, { allowLoopback }))) {
        throw new Error('Provider hostname resolved to an unsafe network address')
      }
      const binding = freezeBinding(target.hostname, resolved)
      return this.requests.request(input, { ...init, redirect: 'error' }, binding)
    }

    return createProviderBoundFetch(provider, networkFetch as typeof fetch)
  }
}

export function createNodeProviderPinnedFetch(provider: ProviderConfig): typeof fetch {
  return new NodeProviderPinnedFetchAdapter().createFetch(provider)
}

export function createPinnedLookup(binding: ProviderPinnedBinding): LookupFunction {
  let nextIndex = 0
  return (hostname, options, callback) => {
    if (hostname.toLowerCase() !== binding.hostname) {
      callback(new Error('Pinned Provider lookup hostname mismatch'), undefined as never, undefined as never)
      return
    }
    const requestedFamily = typeof options === 'number' ? options : options?.family ?? 0
    const candidates = requestedFamily === 4 || requestedFamily === 6
      ? binding.addresses.filter(({ family }) => family === requestedFamily)
      : binding.addresses
    if (candidates.length === 0) {
      callback(new Error(`No approved Provider address for IPv${requestedFamily}`), undefined as never, undefined as never)
      return
    }
    if (typeof options === 'object' && options.all) {
      callback(null, candidates.map(({ address, family }) => ({ address, family })))
      return
    }
    const selected = candidates[nextIndex % candidates.length]!
    nextIndex += 1
    callback(null, selected.address, selected.family)
  }
}

function freezeBinding(hostname: string, addresses: readonly ProviderResolvedAddress[]): ProviderPinnedBinding {
  const unique = new Map(addresses.map((item) => [`${item.family}:${item.address}`, item]))
  return Object.freeze({
    addresses: Object.freeze([...unique.values()].map((item) => Object.freeze({ ...item }))),
    hostname: hostname.toLowerCase(),
  })
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '::1' || /^127\./.test(normalized)
}

function wrapResponseWithDispatcherLifetime(response: Response, dispatcher: Agent): Response {
  if (!response.body) {
    void dispatcher.close()
    return response
  }
  const reader = response.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        await dispatcher.close()
      }
    },
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          controller.close()
          await dispatcher.close()
        } else {
          controller.enqueue(result.value)
        }
      } catch (error) {
        controller.error(error)
        await dispatcher.close()
      }
    },
  })
  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}
