import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Provider network capability boundaries', () => {
  it('keeps DNS and pinned request capabilities behind narrow Main-only Ports', async () => {
    const ports = await readFile(path.resolve('src/main/services/provider-network-ports.ts'), 'utf8')
    const adapter = await readFile(path.resolve('src/main/services/node-provider-pinned-fetch-adapter.ts'), 'utf8')

    expect(ports).toContain('ProviderDnsResolutionPort')
    expect(ports).toContain('ProviderPinnedRequestPort')
    expect(ports).not.toContain("from 'node:")
    expect(ports).not.toContain("from 'undici'")
    expect(adapter).toContain("from './provider-network-ports'")
  })

  it('uses the pinned Adapter as the production default for every AI SDK Provider model', async () => {
    const source = await readFile(path.resolve('src/main/services/ai-sdk-provider-adapter.ts'), 'utf8')
    const connection = await readFile(path.resolve('src/main/services/provider-connection.ts'), 'utf8')

    expect(source).toContain('createNodeProviderPinnedFetch(provider)')
    expect(source).not.toMatch(/fetcher: typeof fetch = fetch/)
    expect(connection).toContain('createNodeProviderPinnedFetch(provider)')
    expect(connection).not.toMatch(/fetcher: typeof fetch = fetch/)
  })
})
