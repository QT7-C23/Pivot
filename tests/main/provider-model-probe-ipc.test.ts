import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPCContract } from '../../src/shared/types/ipc'

const handlers = new Map<string, (request: any) => Promise<any>>()
vi.mock('../../src/main/ipc-registration', () => ({
  handle: (channel: string, handler: (request: any) => Promise<any>) => handlers.set(channel, handler),
}))

import { registerProviderModelProbeIpc } from '../../src/main/provider-model-probe-ipc'
import { ProviderStore } from '../../src/main/services/provider-store'

beforeEach(() => handlers.clear())

describe('provider model probe production IPC registration', () => {
  it('resolves a configured Provider and its secret inside Main before calling the narrow Port', async () => {
    const providers = new ProviderStore({ decrypt: (value) => value, encrypt: (value) => value })
    providers.save({
      apiKey: 'main-secret', baseUrl: 'https://api.openai.com/v1', id: 'openai',
      kind: 'openai', label: 'OpenAI', model: 'worker-model',
    })
    const probe = vi.fn().mockResolvedValue({ models: ['review-model'], truncated: false })
    registerProviderModelProbeIpc(providers, { probe })
    const handler = handlers.get('provider:probe-models')!
    const result = await handler({ forceRefresh: false, providerId: 'openai' } satisfies IPCContract['provider:probe-models']['request'])
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai' }), 'main-secret')
    expect(result).toMatchObject({ available: true, models: ['review-model'], providerId: 'openai' })
    expect(result).not.toHaveProperty('apiKey')
    providers.close()
  })
})
