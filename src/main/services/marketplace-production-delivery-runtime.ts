import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import {
  MarketplaceInstallationCollectionSchema,
  MarketplaceInstallationSummarySchema,
  type MarketplaceInstallationCollection,
  type MarketplaceUninstallRequest,
} from '../../shared/marketplace-delivery-contracts'
import type { MarketplaceCatalogReaderPort } from './marketplace-ports'
import { MarketplaceCatalogTrustRegistry, type MarketplaceTrustedCatalogConfig } from './marketplace-catalog-trust-registry'
import { NodeHttpsMarketplacePackageStagingAdapter } from './node-https-marketplace-package-staging-adapter'
import { NodeMarketplacePackageArtifactInspectionAdapter } from './node-marketplace-package-artifact-inspection-adapter'
import { NodeZipMarketplacePackageArchiveAdapter } from './node-zip-marketplace-package-archive-adapter'
import { NodeMarketplacePackageManifestInspectionAdapter } from './node-marketplace-package-manifest-inspection-adapter'
import { NodeMarketplaceExtractedRootValidationAdapter } from './node-marketplace-extracted-root-validation-adapter'
import { NodeMarketplaceInstallationStorageAdapter } from './node-marketplace-installation-storage-adapter'
import { VerifiedMarketplacePackageArtifactAdapter } from './verified-marketplace-package-artifact-adapter'
import { VerifiedMarketplacePackageDownloadAdapter } from './verified-marketplace-package-download-adapter'
import { VerifiedMarketplacePackageArchiveAdapter } from './verified-marketplace-package-archive-adapter'
import { VerifiedMarketplacePackageManifestAdapter } from './verified-marketplace-package-manifest-adapter'
import { VerifiedMarketplacePackageBindingAdapter } from './verified-marketplace-package-binding-adapter'
import { MarketplaceCapabilityReviewAdapter } from './marketplace-capability-review-adapter'
import { SqliteMarketplaceInstallationRegistryAdapter } from './sqlite-marketplace-installation-registry-adapter'
import { MarketplaceInstallationCoordinator } from './marketplace-installation-coordinator'
import { MarketplaceInstallationLifecycleCoordinator } from './marketplace-installation-lifecycle-coordinator'
import { MarketplacePackageDeliveryWorkflow, type MarketplacePackageDeliveryPort } from './marketplace-package-delivery-workflow'
import type {
  MarketplaceInstallationLifecyclePort,
  MarketplaceInstallationRegistryReaderPort,
  MarketplaceInstallationRegistryWriterPort,
  MarketplaceInstallationStoragePort,
} from './marketplace-installation-ports'
import type {
  MarketplaceActivationPort,
  MarketplaceActivationRegistryReaderPort,
} from './marketplace-activation-ports'
import type {
  MarketplaceActiveResourceReaderPort,
  MarketplaceAgentAugmentationPort,
  MarketplacePluginInvocationPort,
  MarketplaceResourceSelectionPort,
} from './marketplace-resource-consumer-ports'
import { MarketplaceResourceConsumerAdapter } from './marketplace-resource-consumer-adapter'
import { MarketplaceWasmPluginSandboxAdapter } from './marketplace-wasm-plugin-sandbox-adapter'
import { NodeMarketplaceInstalledPackageReaderAdapter } from './node-marketplace-installed-package-reader-adapter'
import { SqliteMarketplaceActivationRegistryAdapter } from './sqlite-marketplace-activation-registry-adapter'
import { MarketplaceActivationCoordinator } from './marketplace-activation-coordinator'
import { SqliteMarketplaceUpdateRegistryAdapter } from './sqlite-marketplace-update-registry-adapter'
import { MarketplaceUpdateCoordinator } from './marketplace-update-coordinator'
import { MarketplacePackageUpdateWorkflow, type MarketplacePackageUpdateWorkflowPort } from './marketplace-package-update-workflow'
import type { MarketplaceInstallationPort } from './marketplace-installation-ports'
import { MarketplacePublicationQualificationService } from './marketplace-publication-qualification-service'
import type { MarketplacePublicationQualification } from '../../shared/marketplace-publication-qualification-contracts'

export interface MarketplaceProductionDeliveryRuntime {
  readonly activation: MarketplaceActivationPort
  readonly activeResources: MarketplaceActiveResourceReaderPort
  readonly agentAugmentations: MarketplaceAgentAugmentationPort
  close(): void
  readonly delivery: MarketplacePackageDeliveryPort | null
  readonly installations: Readonly<{
    list(): MarketplaceInstallationCollection
    uninstall(request: MarketplaceUninstallRequest): Promise<void>
  }>
  readonly pluginInvocation: MarketplacePluginInvocationPort
  readonly qualification: Readonly<{ qualify(): Promise<MarketplacePublicationQualification> }>
  readonly ready: Promise<void>
  readonly selection: MarketplaceResourceSelectionPort
  readonly updates: MarketplacePackageUpdateWorkflowPort | null
}

export function createMarketplaceProductionDeliveryRuntime(options: {
  readonly catalog: MarketplaceCatalogReaderPort | null
  readonly clock?: () => Date
  readonly databasePath: string
  readonly fetchImpl?: typeof fetch
  readonly trustConfig: MarketplaceTrustedCatalogConfig | null
  readonly userDataPath: string
}): MarketplaceProductionDeliveryRuntime {
  const root = requireAbsoluteRoot(options.userDataPath)
  const stagingDirectory = createDirectory(root, 'marketplace', 'staging')
  const extractionRoot = createDirectory(root, 'marketplace', 'extracted')
  const installRoot = createDirectory(root, 'marketplace', 'installed')
  const registry = new SqliteMarketplaceInstallationRegistryAdapter({
    clock: options.clock,
    databasePath: options.databasePath,
  })
  const registryReader = registry.openReaderPort()
  const registryWriter = registry.openWriterPort()
  const storage = new NodeMarketplaceInstallationStorageAdapter({ installRoot }).openStoragePort()
  const activationRegistry = new SqliteMarketplaceActivationRegistryAdapter({
    clock: options.clock,
    databasePath: options.databasePath,
  })
  const updateRegistry = new SqliteMarketplaceUpdateRegistryAdapter({
    clock: options.clock,
    databasePath: options.databasePath,
  })
  try {
    const lifecycleCoordinator = new MarketplaceInstallationLifecycleCoordinator({
      registryReader,
      registryWriter,
      storage,
    })
    const lifecycle = lifecycleCoordinator.openLifecyclePort()
    const consumer = new MarketplaceResourceConsumerAdapter({
      sandbox: new MarketplaceWasmPluginSandboxAdapter().openPort(),
    })
    const packages = new NodeMarketplaceInstalledPackageReaderAdapter({
      installations: registryReader,
      installRoot,
    }).openReaderPort()
    const activationCoordinator = new MarketplaceActivationCoordinator({
      installations: registryReader,
      packages,
      registrations: consumer.openRegistrationPort(),
      registryReader: activationRegistry.openReaderPort(),
      registryWriter: activationRegistry.openWriterPort(),
    })
    const activation = activationCoordinator.openActivationPort()
    const deliveryComposition = options.catalog && options.trustConfig
      ? createDelivery({ ...options, catalog: options.catalog, trustConfig: options.trustConfig }, {
          extractionRoot, registryReader, registryWriter, stagingDirectory, storage,
        })
      : null
    const updateCoordinator = deliveryComposition
      ? new MarketplaceUpdateCoordinator({
          installation: deliveryComposition.installation,
          installations: registryReader,
          lifecycle,
          switches: consumer.openVersionSwitchPort(),
          updates: updateRegistry.openPort(),
        })
      : null
    const updates = deliveryComposition && updateCoordinator
      ? new MarketplacePackageUpdateWorkflow({
          activation,
          activations: activationRegistry.openReaderPort(),
          delivery: deliveryComposition.delivery,
          evidence: updateRegistry.openPort(),
          lifecycle,
          updates: updateCoordinator.openUpdatePort(),
        }).openPort()
      : null
    const ready = lifecycleCoordinator.openRecoveryPort().recover()
      .then(() => activationCoordinator.openRecoveryPort().restore())
      .then(async () => {
        for (const update of updateRegistry.openPort().listReady()) {
          await consumer.openVersionSwitchPort().switchTo(
            update.candidate.identity,
            update.candidate.installationRevision,
          )
        }
      })
      .then(() => undefined)
    const qualification = new MarketplacePublicationQualificationService({
      activeKinds: ['plugin', 'prompt', 'skill', 'theme'],
      catalog: options.catalog,
      clock: options.clock,
      installations: registryReader,
    })
    return Object.freeze({
      activation,
      activeResources: consumer.openReaderPort(),
      agentAugmentations: consumer.openAgentAugmentationPort(),
      close: () => { updateRegistry.close(); activationRegistry.close(); registry.close() },
      delivery: deliveryComposition?.delivery ?? null,
      installations: installationFacade(
        registryReader,
        lifecycle,
        activationRegistry.openReaderPort(),
        activation,
      ),
      pluginInvocation: consumer.openPluginInvocationPort(),
      qualification: Object.freeze({ qualify: () => qualification.qualify() }),
      ready,
      selection: consumer.openVersionSwitchPort(),
      updates,
    })
  } catch (error) {
    updateRegistry.close()
    activationRegistry.close()
    registry.close()
    throw error
  }
}

function createDelivery(
  options: {
    readonly catalog: MarketplaceCatalogReaderPort
    readonly clock?: () => Date
    readonly fetchImpl?: typeof fetch
    readonly trustConfig: MarketplaceTrustedCatalogConfig
  },
  infrastructure: {
    readonly extractionRoot: string
    readonly registryReader: MarketplaceInstallationRegistryReaderPort
    readonly registryWriter: MarketplaceInstallationRegistryWriterPort
    readonly stagingDirectory: string
    readonly storage: MarketplaceInstallationStoragePort
  },
): Readonly<{ delivery: MarketplacePackageDeliveryPort; installation: MarketplaceInstallationPort }> {
  const trust = new MarketplaceCatalogTrustRegistry([options.trustConfig]).openReaderPort()
  const artifactVerification = new VerifiedMarketplacePackageArtifactAdapter({
    clock: options.clock,
    inspection: new NodeMarketplacePackageArtifactInspectionAdapter().openInspectionPort(),
    trust,
  }).openVerificationPort()
  const download = new VerifiedMarketplacePackageDownloadAdapter({
    staging: new NodeHttpsMarketplacePackageStagingAdapter({
      fetchImpl: options.fetchImpl,
      stagingDirectory: infrastructure.stagingDirectory,
    }).openStagingPort(),
    trust,
    verification: artifactVerification,
  }).openDownloadPort()
  const zip = new NodeZipMarketplacePackageArchiveAdapter({ extractionRoot: infrastructure.extractionRoot })
  const archive = new VerifiedMarketplacePackageArchiveAdapter({
    extraction: zip.openExtractionPort(),
    inspection: zip.openInspectionPort(),
  }).openPreparationPort()
  const manifests = new VerifiedMarketplacePackageManifestAdapter({
    inspection: new NodeMarketplacePackageManifestInspectionAdapter().openInspectionPort(),
  }).openReaderPort()
  const binding = new VerifiedMarketplacePackageBindingAdapter({
    rootValidation: new NodeMarketplaceExtractedRootValidationAdapter().openValidationPort(),
  }).openBindingPort()
  const reviews = new MarketplaceCapabilityReviewAdapter({ clock: options.clock }).openReviewPort()
  const installation = new MarketplaceInstallationCoordinator({
    registryReader: infrastructure.registryReader,
    registryWriter: infrastructure.registryWriter,
    storage: infrastructure.storage,
  }).openInstallationPort()
  const delivery = new MarketplacePackageDeliveryWorkflow({
    archive,
    binding,
    catalog: options.catalog,
    download,
    installation,
    manifests,
    reviews,
  }).openDeliveryPort()
  return Object.freeze({ delivery, installation })
}

function installationFacade(
  reader: MarketplaceInstallationRegistryReaderPort,
  lifecycle: MarketplaceInstallationLifecyclePort,
  activations: MarketplaceActivationRegistryReaderPort,
  activation: MarketplaceActivationPort,
) {
  return Object.freeze({
    list(): MarketplaceInstallationCollection {
      return MarketplaceInstallationCollectionSchema.parse({
        items: reader.listInstalled().map((record) => MarketplaceInstallationSummarySchema.parse({
          capabilities: record.capabilities,
          identity: record.identity,
          revision: record.revision,
          state: record.state,
        })),
        schemaVersion: 1,
      })
    },
    async uninstall(request: MarketplaceUninstallRequest) {
      const active = activations.get(request.identity)
      if (active) await activation.deactivate({ expectedActivationRevision: active.revision, identity: active.identity })
      await lifecycle.uninstall(request.identity, request.expectedRevision)
    },
  })
}

function requireAbsoluteRoot(input: string): string {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error('Marketplace production user-data root must be absolute')
  }
  const resolved = path.resolve(input)
  const stats = lstatSync(resolved)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Marketplace production user-data root must be a real directory')
  }
  return realpathSync.native(resolved)
}

function createDirectory(root: string, ...segments: string[]): string {
  let current = root
  for (const segment of segments) {
    const candidate = path.join(current, segment)
    try { mkdirSync(candidate, { mode: 0o700 }) } catch (error) {
      if (!isCode(error, 'EEXIST')) throw error
    }
    const stats = lstatSync(candidate)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Marketplace owned directory must be a real directory, not a symbolic link or junction')
    }
    const real = realpathSync.native(candidate)
    const relative = path.relative(root, real)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Marketplace owned directory escaped its user-data root')
    }
    current = real
  }
  return current
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
