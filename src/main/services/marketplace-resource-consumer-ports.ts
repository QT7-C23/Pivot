import type { MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import type {
  MarketplaceActiveResourceCollection,
  MarketplaceDataResource,
  MarketplacePluginInvocationResult,
} from '../../shared/marketplace-resource-contracts'

export type MarketplaceInstalledResource = MarketplaceDataResource | Readonly<{
  bytes: Uint8Array
  kind: 'plugin'
}>

export interface MarketplaceAgentAugmentationPort {
  read(): string
}

export interface MarketplaceActiveResourceReaderPort {
  list(): MarketplaceActiveResourceCollection
}

export interface MarketplacePluginSandboxPort {
  invoke(registrationId: string): Promise<MarketplacePluginInvocationResult>
  register(registrationId: string, bytes: Uint8Array): Promise<void>
  unregister(registrationId: string): Promise<void>
}

export interface MarketplacePluginInvocationPort {
  invoke(registrationId: string): Promise<MarketplacePluginInvocationResult>
}

export interface MarketplaceResourceSelectionPort {
  switchTo(identity: MarketplacePackageArtifactIdentity, installationRevision: number): Promise<void>
}
