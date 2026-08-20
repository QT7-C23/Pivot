import type {
  MarketplaceActivationCommitRequest,
  MarketplaceActivationRecord,
  MarketplaceActivationRequest,
  MarketplaceDeactivationRequest,
} from '../../shared/marketplace-activation-contracts'
import type { MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import type {
  MarketplaceCapability,
  MarketplacePackageManifest,
} from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplaceInstalledResource } from './marketplace-resource-consumer-ports'

export interface MarketplaceInstalledPackageReaderPort {
  readManifest(identity: MarketplacePackageArtifactIdentity): Promise<MarketplacePackageManifest>
  readResource(identity: MarketplacePackageArtifactIdentity): Promise<MarketplaceInstalledResource>
}

export interface MarketplaceResourceRegistrationRequest {
  readonly capabilities: readonly MarketplaceCapability[]
  readonly entrypoint: string
  readonly identity: MarketplacePackageArtifactIdentity
  readonly installationRevision: number
  readonly resource: MarketplaceInstalledResource
}

export interface MarketplaceResourceRegistrationPort {
  register(request: MarketplaceResourceRegistrationRequest): Promise<Readonly<{ registrationId: string }>>
  unregister(registrationId: string): Promise<void>
}

export interface MarketplaceActivationRegistryReaderPort {
  get(identity: MarketplacePackageArtifactIdentity): MarketplaceActivationRecord | null
  listActive(): readonly MarketplaceActivationRecord[]
}

export interface MarketplaceActivationRegistryWriterPort {
  activate(request: MarketplaceActivationCommitRequest): MarketplaceActivationRecord
  deactivate(identity: MarketplacePackageArtifactIdentity, expectedRevision: number): void
}

export interface MarketplaceActivationPort {
  activate(request: MarketplaceActivationRequest): Promise<MarketplaceActivationRecord>
  deactivate(request: MarketplaceDeactivationRequest): Promise<void>
}

export interface MarketplaceActivationRecoveryPort {
  restore(): Promise<void>
}
