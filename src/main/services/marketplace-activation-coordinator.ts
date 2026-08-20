import {
  MarketplaceActivationRequestSchema,
  MarketplaceDeactivationRequestSchema,
  type MarketplaceActivationRequest,
  type MarketplaceDeactivationRequest,
} from '../../shared/marketplace-activation-contracts'
import { MarketplacePackageManifestSchema } from '../../shared/marketplace-package-manifest-contracts'
import type { MarketplaceInstallationRegistryReaderPort } from './marketplace-installation-ports'
import type {
  MarketplaceActivationPort,
  MarketplaceActivationRecoveryPort,
  MarketplaceActivationRegistryReaderPort,
  MarketplaceActivationRegistryWriterPort,
  MarketplaceInstalledPackageReaderPort,
  MarketplaceResourceRegistrationPort,
} from './marketplace-activation-ports'

export class MarketplaceActivationCoordinator {
  private readonly installations: MarketplaceInstallationRegistryReaderPort
  private readonly packages: MarketplaceInstalledPackageReaderPort
  private readonly registrations: MarketplaceResourceRegistrationPort
  private readonly registryReader: MarketplaceActivationRegistryReaderPort
  private readonly registryWriter: MarketplaceActivationRegistryWriterPort

  constructor(options: {
    readonly installations: MarketplaceInstallationRegistryReaderPort
    readonly packages: MarketplaceInstalledPackageReaderPort
    readonly registrations: MarketplaceResourceRegistrationPort
    readonly registryReader: MarketplaceActivationRegistryReaderPort
    readonly registryWriter: MarketplaceActivationRegistryWriterPort
  }) {
    this.installations = options.installations
    this.packages = options.packages
    this.registrations = options.registrations
    this.registryReader = options.registryReader
    this.registryWriter = options.registryWriter
  }

  openActivationPort(): MarketplaceActivationPort {
    return Object.freeze({
      activate: (request: MarketplaceActivationRequest) => this.activate(request),
      deactivate: (request: MarketplaceDeactivationRequest) => this.deactivate(request),
    })
  }

  openRecoveryPort(): MarketplaceActivationRecoveryPort {
    return Object.freeze({ restore: () => this.restore() })
  }

  private async activate(input: unknown) {
    const request = MarketplaceActivationRequestSchema.parse(input)
    if (this.registryReader.get(request.identity)) {
      throw new Error('Marketplace resource is already active')
    }
    const installation = this.installations.get(request.identity)
    if (!installation || installation.state !== 'installed') {
      throw new Error('Marketplace activation requires an installed package')
    }
    if (installation.revision !== request.expectedInstallationRevision) {
      throw new Error('Marketplace installation revision is stale')
    }
    const manifest = MarketplacePackageManifestSchema.parse(
      await this.packages.readManifest(request.identity),
    )
    if (JSON.stringify(manifest.identity) !== JSON.stringify(installation.identity)
      || JSON.stringify(manifest.capabilities) !== JSON.stringify(installation.capabilities)) {
      throw new Error('Marketplace installed manifest does not match installation evidence')
    }
    const registration = await this.registrations.register({
      capabilities: manifest.capabilities,
      entrypoint: manifest.entrypoint,
      identity: manifest.identity,
      installationRevision: installation.revision,
      resource: await this.packages.readResource(request.identity),
    })
    try {
      return this.registryWriter.activate({
        capabilities: installation.capabilities,
        identity: installation.identity,
        installationRevision: installation.revision,
        registrationId: registration.registrationId,
      })
    } catch (error) {
      try {
        await this.registrations.unregister(registration.registrationId)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Marketplace activation failed and runtime registration rollback was incomplete',
        )
      }
      throw error
    }
  }

  private async deactivate(input: unknown): Promise<void> {
    const request = MarketplaceDeactivationRequestSchema.parse(input)
    const active = this.registryReader.get(request.identity)
    if (!active) return
    if (active.revision !== request.expectedActivationRevision) {
      throw new Error('Marketplace activation revision is stale')
    }
    const registrationRequest = await this.registrationRequest(active.identity, active.installationRevision)
    await this.registrations.unregister(active.registrationId)
    try {
      this.registryWriter.deactivate(active.identity, active.revision)
    } catch (error) {
      try {
        const restored = await this.registrations.register(registrationRequest)
        if (restored.registrationId !== active.registrationId) {
          throw new Error('Marketplace deactivation rollback registration identity changed')
        }
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Marketplace deactivation failed and registration rollback was incomplete')
      }
      throw error
    }
  }

  private async restore(): Promise<void> {
    for (const active of this.registryReader.listActive()) {
      const registration = await this.registrations.register(
        await this.registrationRequest(active.identity, active.installationRevision),
      )
      if (registration.registrationId !== active.registrationId) {
        await this.registrations.unregister(registration.registrationId)
        throw new Error('Marketplace activation recovery registration identity changed')
      }
    }
  }

  private async registrationRequest(identity: Parameters<MarketplaceActivationRegistryReaderPort['get']>[0], revision: number) {
    const installation = this.installations.get(identity)
    if (!installation || installation.state !== 'installed' || installation.revision !== revision) {
      throw new Error('Marketplace activation recovery requires the exact installed revision')
    }
    const manifest = MarketplacePackageManifestSchema.parse(await this.packages.readManifest(identity))
    if (JSON.stringify(manifest.identity) !== JSON.stringify(installation.identity)
      || JSON.stringify(manifest.capabilities) !== JSON.stringify(installation.capabilities)) {
      throw new Error('Marketplace installed manifest does not match installation evidence')
    }
    return Object.freeze({
      capabilities: manifest.capabilities,
      entrypoint: manifest.entrypoint,
      identity: manifest.identity,
      installationRevision: installation.revision,
      resource: await this.packages.readResource(identity),
    })
  }
}
