import { isIP } from 'node:net'
import type { ProviderConfig, ProviderKind } from '../../shared/types/domain'

const OFFICIAL_PROVIDER_ENDPOINTS: Record<Exclude<ProviderKind, 'custom'>, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  kimi: 'https://api.moonshot.cn/v1',
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

const METADATA_HOSTNAMES = new Set([
  'instance-data',
  'instance-data.ec2.internal',
  'metadata',
  'metadata.azure.internal',
  'metadata.google.internal',
])

export function validateAndNormalizeProviderEndpoint(kind: ProviderKind, value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Provider endpoint must be a valid absolute URL')
  }
  if (url.username || url.password) throw new Error('Provider endpoint must not contain credentials')
  if (url.hash) throw new Error('Provider endpoint must not contain a fragment')
  if (url.search) throw new Error('Provider endpoint must not contain query parameters')

  const normalized = normalizeUrl(url)
  if (kind !== 'custom') {
    if (normalized !== OFFICIAL_PROVIDER_ENDPOINTS[kind]) {
      throw new Error(`Provider endpoint must use the code-owned official endpoint for ${kind}`)
    }
    return normalized
  }

  const hostname = normalizeHostname(url.hostname)
  const loopback = isLoopbackHost(hostname)
  if (url.protocol === 'http:') {
    if (!loopback) throw new Error('Provider endpoint HTTP is allowed only for loopback hosts')
  } else if (url.protocol !== 'https:') {
    throw new Error('Provider endpoint must use HTTPS or loopback HTTP')
  }
  if (METADATA_HOSTNAMES.has(hostname) || (!loopback && isUnsafeIpLiteral(hostname))) {
    throw new Error('Provider endpoint must not target private, link-local, metadata, or reserved networks')
  }

  return normalized
}

export function createProviderBoundFetch(
  provider: ProviderConfig,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  const baseUrl = new URL(validateAndNormalizeProviderEndpoint(provider.kind, provider.baseUrl))
  const basePath = baseUrl.pathname.replace(/\/+$/, '')

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
    const targetPath = target.pathname.replace(/\/+$/, '')
    if (target.origin !== baseUrl.origin || (targetPath !== basePath && !targetPath.startsWith(`${basePath}/`))) {
      throw new Error('Provider request escaped its configured trust target')
    }
    return fetcher(input, { ...init, redirect: 'error' })
  }) as typeof fetch
}

export function isProviderNetworkAddressAllowed(
  address: string,
  options: { allowLoopback: boolean },
): boolean {
  const normalized = normalizeHostname(address)
  if (isLoopbackHost(normalized)) return options.allowLoopback
  return isIP(normalized) !== 0 && !isUnsafeIpLiteral(normalized)
}

function normalizeUrl(url: URL): string {
  const normalized = new URL(url.toString())
  normalized.pathname = normalized.pathname.replace(/\/+$/, '') || '/'
  return normalized.toString().replace(/\/$/, normalized.pathname === '/' ? '/' : '')
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function isLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') return true
  if (isIP(hostname) !== 4) return false
  return Number(hostname.split('.')[0]) === 127
}

function isUnsafeIpLiteral(hostname: string): boolean {
  const version = isIP(hostname)
  if (version === 4) return isUnsafeIpv4(hostname)
  if (version !== 6) return false

  const value = hostname.toLowerCase()
  if (value === '::') return true
  if (/^(?:fc|fd)/.test(value)) return true
  if (/^f[ef][89ab]/.test(value)) return true
  if (/^ff/.test(value)) return true
  const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  return mapped ? isUnsafeIpv4(mapped) : false
}

function isUnsafeIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number)
  const [a, b] = octets
  return a === 0
    || a === 10
    || a === 100 && b >= 64 && b <= 127
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && (b === 0 || b === 168)
    || a === 198 && (b === 18 || b === 19 || b === 51)
    || a === 203 && b === 0
    || a >= 224
}
