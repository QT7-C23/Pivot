import { describe, expect, it } from 'vitest'
import { MarketplaceResourceConsumerAdapter } from '../../src/main/services/marketplace-resource-consumer-adapter'

const identity = (kind: 'plugin' | 'prompt' | 'skill' | 'theme', version = '1.0.0') => ({
  kind, resourceId: `${kind}-one`, schemaVersion: 1 as const, sourceId: 'official', version,
}) as const

describe('MarketplaceResourceConsumerAdapter', () => {
  it('registers data resources, supplies agent augmentation, and switches versions', async () => {
    const consumer = new MarketplaceResourceConsumerAdapter()
    const registrations = consumer.openRegistrationPort()
    const first = await registrations.register({
      capabilities: [], entrypoint: 'prompt.json', identity: identity('prompt'), installationRevision: 1,
      resource: { content: 'First guidance', id: 'prompt-one', kind: 'prompt', schemaVersion: 1, title: 'First' },
    })
    const second = await registrations.register({
      capabilities: [], entrypoint: 'prompt.json', identity: identity('prompt', '2.0.0'), installationRevision: 1,
      resource: { content: 'Second guidance', id: 'prompt-one', kind: 'prompt', schemaVersion: 1, title: 'Second' },
    })
    expect(consumer.openAgentAugmentationPort().read()).toContain('First guidance')
    await consumer.openVersionSwitchPort().switchTo(identity('prompt', '2.0.0'), 1)
    expect(consumer.openAgentAugmentationPort().read()).toContain('Second guidance')
    expect(consumer.openAgentAugmentationPort().read()).not.toContain('First guidance')
    await registrations.unregister(second.registrationId)
    expect(consumer.openAgentAugmentationPort().read()).toBe('')
    await registrations.unregister(first.registrationId)
  })

  it('rejects resource identity drift and capabilities on data-only resources', async () => {
    const registrations = new MarketplaceResourceConsumerAdapter().openRegistrationPort()
    await expect(registrations.register({
      capabilities: ['network.fetch'], entrypoint: 'prompt.json', identity: identity('prompt'), installationRevision: 1,
      resource: { content: 'x', id: 'prompt-one', kind: 'prompt', schemaVersion: 1, title: 'X' },
    })).rejects.toThrow('capabilities')
    await expect(registrations.register({
      capabilities: [], entrypoint: 'prompt.json', identity: identity('prompt'), installationRevision: 1,
      resource: { content: 'x', id: 'other', kind: 'prompt', schemaVersion: 1, title: 'X' },
    })).rejects.toThrow('identity')
  })
})
