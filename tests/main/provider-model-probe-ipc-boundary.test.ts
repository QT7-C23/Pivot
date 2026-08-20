import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('provider model probe IPC boundary', () => {
  it('keeps the network Adapter and Provider Store in Main and exposes only a narrow query', () => {
    const root = process.cwd()
    const shared = readFileSync(path.join(root, 'src/shared/provider-model-probe-contracts.ts'), 'utf8')
    const renderer = readFileSync(path.join(root, 'src/renderer/services/provider.service.ts'), 'utf8')
    expect(shared).not.toMatch(/from ['"].*main\//)
    expect(shared).not.toMatch(/apiKey|baseUrl|filesystem|Database/)
    expect(renderer).not.toMatch(/ProviderStore|ProbeAdapter|readSecret/)
    expect(renderer).toContain("'provider:probe-models'")
  })
})
