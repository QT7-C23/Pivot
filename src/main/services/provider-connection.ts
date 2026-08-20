import type { ProviderConfig, ProviderConnectionResult } from '../../shared/types/domain'
import { createProviderBoundFetch, validateAndNormalizeProviderEndpoint } from './provider-trust-policy'
import { createNodeProviderPinnedFetch } from './node-provider-pinned-fetch-adapter'

export async function testProviderConnection(
  provider: ProviderConfig,
  apiKey: string,
  fetcher?: typeof fetch,
): Promise<ProviderConnectionResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const baseUrl = validateAndNormalizeProviderEndpoint(provider.kind, provider.baseUrl)
    const providerFetch = fetcher
      ? createProviderBoundFetch(provider, fetcher)
      : createNodeProviderPinnedFetch(provider)
    const response = await providerFetch(`${baseUrl}/models`, {
      headers: provider.kind === 'anthropic'
        ? { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey }
        : { Authorization: `Bearer ${apiKey}` },
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    })
    const result = {
      latencyMs: Date.now() - startedAt,
      message: response.ok ? 'Connection succeeded' : `Provider returned HTTP ${response.status}`,
      ok: response.ok,
      status: response.status,
    }
    await response.body?.cancel()
    return result
  } catch (error) {
    return {
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error && error.name === 'AbortError' ? 'Connection timed out' : 'Connection failed',
      ok: false,
      status: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}
