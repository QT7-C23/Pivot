import { createHash } from 'node:crypto'
import { MarketplacePackageArtifactIdentitySchema, type MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import { MarketplaceActiveResourceCollectionSchema, MarketplaceDataResourceSchema } from '../../shared/marketplace-resource-contracts'
import type { MarketplaceResourceRegistrationPort, MarketplaceResourceRegistrationRequest } from './marketplace-activation-ports'
import type {
  MarketplaceActiveResourceReaderPort,
  MarketplaceAgentAugmentationPort,
  MarketplacePluginInvocationPort,
  MarketplacePluginSandboxPort,
  MarketplaceResourceSelectionPort,
} from './marketplace-resource-consumer-ports'

interface Registration {
  readonly displayName: string
  readonly id: string
  readonly request: MarketplaceResourceRegistrationRequest
}

export class MarketplaceResourceConsumerAdapter {
  private readonly registrations = new Map<string, Registration>()
  private readonly selectedByResource = new Map<string, string>()
  private selectedTheme: string | null = null
  private readonly sandbox: MarketplacePluginSandboxPort | null

  constructor(options: { readonly sandbox?: MarketplacePluginSandboxPort } = {}) {
    this.sandbox = options.sandbox ?? null
  }

  openRegistrationPort(): MarketplaceResourceRegistrationPort {
    return Object.freeze({
      register: (request: MarketplaceResourceRegistrationRequest) => this.register(request),
      unregister: (registrationId: string) => this.unregister(registrationId),
    })
  }

  openVersionSwitchPort(): MarketplaceResourceSelectionPort {
    return Object.freeze({ switchTo: (identity: MarketplacePackageArtifactIdentity, revision: number) => this.switchTo(identity, revision) })
  }

  openAgentAugmentationPort(): MarketplaceAgentAugmentationPort {
    return Object.freeze({ read: () => this.agentAugmentation() })
  }

  openReaderPort(): MarketplaceActiveResourceReaderPort {
    return Object.freeze({ list: () => this.list() })
  }

  openPluginInvocationPort(): MarketplacePluginInvocationPort {
    return Object.freeze({ invoke: (registrationId: string) => this.invoke(registrationId) })
  }

  private async register(request: MarketplaceResourceRegistrationRequest): Promise<Readonly<{ registrationId: string }>> {
    const identity = MarketplacePackageArtifactIdentitySchema.parse(request.identity)
    const registrationId = idFor(identity, request.installationRevision)
    let displayName: string
    if (identity.kind === 'plugin') {
      if (request.resource.kind !== 'plugin') throw new Error('Marketplace resource kind does not match package identity')
      if (request.capabilities.length > 0) throw new Error('Marketplace Wasm v1 exposes no plugin capabilities')
      if (!this.sandbox) throw new Error('Marketplace plugin sandbox is unavailable')
      await this.sandbox.register(registrationId, request.resource.bytes)
      displayName = identity.resourceId
    } else {
      if (request.resource.kind === 'plugin') throw new Error('Marketplace resource kind does not match package identity')
      const resource = MarketplaceDataResourceSchema.parse(request.resource)
      if (resource.kind !== identity.kind || resource.id !== identity.resourceId) {
        throw new Error('Marketplace resource content identity does not match package identity')
      }
      if (request.capabilities.length > 0 && resource.kind !== 'skill') {
        throw new Error('Marketplace data-only resource cannot receive runtime capabilities')
      }
      if (resource.kind === 'skill' && request.capabilities.some((item) => item !== 'workspace.read')) {
        throw new Error('Marketplace skill capabilities exceed the read-only consumer')
      }
      displayName = resource.kind === 'prompt' ? resource.title : resource.name
    }
    const existing = this.registrations.get(registrationId)
    if (existing && JSON.stringify(existing.request.resource) !== JSON.stringify(request.resource)) {
      throw new Error('Marketplace registration identity is already bound to different content')
    }
    this.registrations.set(registrationId, Object.freeze({ displayName, id: registrationId, request }))
    const key = logicalKey(identity)
    if (!this.selectedByResource.has(key)) this.selectedByResource.set(key, registrationId)
    if (identity.kind === 'theme') this.selectedTheme = registrationId
    return Object.freeze({ registrationId })
  }

  private async unregister(registrationId: string): Promise<void> {
    const registration = this.registrations.get(registrationId)
    if (!registration) return
    if (registration.request.identity.kind === 'plugin') await this.sandbox?.unregister(registrationId)
    this.registrations.delete(registrationId)
    const key = logicalKey(registration.request.identity)
    if (this.selectedByResource.get(key) === registrationId) this.selectedByResource.delete(key)
    if (this.selectedTheme === registrationId) this.selectedTheme = null
  }

  private async switchTo(identityInput: MarketplacePackageArtifactIdentity, revision: number): Promise<void> {
    const identity = MarketplacePackageArtifactIdentitySchema.parse(identityInput)
    const registrationId = idFor(identity, revision)
    if (!this.registrations.has(registrationId)) throw new Error('Marketplace resource version is not registered')
    this.selectedByResource.set(logicalKey(identity), registrationId)
    if (identity.kind === 'theme') this.selectedTheme = registrationId
  }

  private agentAugmentation(): string {
    const blocks: string[] = []
    for (const registration of this.selectedRegistrations()) {
      const resource = registration.request.resource
      if (resource.kind === 'prompt') {
        blocks.push(`<marketplace-prompt id="${resource.id}">\n${resource.content}\n</marketplace-prompt>`)
      } else if (resource.kind === 'skill') {
        blocks.push(`<marketplace-skill id="${resource.id}">\n${resource.instructions}\n</marketplace-skill>`)
      }
    }
    return blocks.join('\n\n')
  }

  private list() {
    return MarketplaceActiveResourceCollectionSchema.parse({
      items: this.selectedRegistrations().map((registration) => {
        const resource = registration.request.resource
        return {
          displayName: registration.displayName,
          identity: registration.request.identity,
          installationRevision: registration.request.installationRevision,
          registrationId: registration.id,
          themeTokens: resource.kind === 'theme' && registration.id === this.selectedTheme ? resource.tokens : null,
        }
      }),
      schemaVersion: 1,
    })
  }

  private async invoke(registrationId: string) {
    const registration = this.registrations.get(registrationId)
    if (!registration || registration.request.resource.kind !== 'plugin') {
      throw new Error('Marketplace plugin registration is not active')
    }
    if (this.selectedByResource.get(logicalKey(registration.request.identity)) !== registrationId) {
      throw new Error('Marketplace plugin registration is not selected')
    }
    if (!this.sandbox) throw new Error('Marketplace plugin sandbox is unavailable')
    return this.sandbox.invoke(registrationId)
  }

  private selectedRegistrations(): Registration[] {
    return [...this.selectedByResource.values()]
      .map((id) => this.registrations.get(id))
      .filter((value): value is Registration => Boolean(value))
      .sort((left, right) => left.id.localeCompare(right.id, 'en'))
  }
}

function logicalKey(identity: MarketplacePackageArtifactIdentity): string {
  return `${identity.sourceId}:${identity.kind}:${identity.resourceId}`
}

function idFor(identity: MarketplacePackageArtifactIdentity, revision: number): string {
  if (!Number.isInteger(revision) || revision < 0) throw new Error('Marketplace installation revision is invalid')
  return `marketplace-${createHash('sha256').update(JSON.stringify(identity)).update(`:${revision}`).digest('hex').slice(0, 32)}`
}
