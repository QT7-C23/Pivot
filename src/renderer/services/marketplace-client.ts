import {
  MarketplaceCatalogReadResultSchema,
  MarketplaceFavoriteCollectionSchema,
  MarketplaceFavoriteSetRequestSchema,
  type MarketplaceCatalogReadResult,
  type MarketplaceFavoriteCollection,
  type MarketplaceFavoriteSetRequest,
} from '../../shared/marketplace-contracts'
import {
  MarketplaceInstallRequestSchema,
  MarketplaceInstallResultSchema,
  MarketplaceInstallationCollectionSchema,
  MarketplaceUninstallRequestSchema,
  type MarketplaceInstallRequest,
  type MarketplaceInstallResult,
  type MarketplaceInstallationCollection,
  type MarketplaceUninstallRequest,
  MarketplaceUpdateDeliveryRequestSchema,
  MarketplaceUpdateDeliveryResultSchema,
  type MarketplaceUpdateDeliveryRequest,
  type MarketplaceUpdateDeliveryResult,
} from '../../shared/marketplace-delivery-contracts'
import {
  MarketplaceUpdateActionRequestSchema,
  MarketplaceUpdateCollectionSchema,
  MarketplaceUpdateRecordSchema,
  type MarketplaceUpdateActionRequest,
  type MarketplaceUpdateCollection,
  type MarketplaceUpdateRecord,
} from '../../shared/marketplace-update-contracts'
import {
  MarketplaceActivationRecordSchema,
  MarketplaceActivationRequestSchema,
  MarketplaceDeactivationRequestSchema,
  type MarketplaceActivationRecord,
  type MarketplaceActivationRequest,
  type MarketplaceDeactivationRequest,
} from '../../shared/marketplace-activation-contracts'
import {
  MarketplaceActiveResourceCollectionSchema,
  MarketplacePluginInvocationRequestSchema,
  MarketplacePluginInvocationResultSchema,
  type MarketplaceActiveResourceCollection,
  type MarketplacePluginInvocationRequest,
  type MarketplacePluginInvocationResult,
} from '../../shared/marketplace-resource-contracts'
import {
  MarketplacePublicationQualificationSchema,
  type MarketplacePublicationQualification,
} from '../../shared/marketplace-publication-qualification-contracts'

type MarketplaceChannel =
  | 'marketplace:catalog'
  | 'marketplace:favorites'
  | 'marketplace:set-favorite'
  | 'marketplace:installations'
  | 'marketplace:install'
  | 'marketplace:uninstall'
  | 'marketplace:activate'
  | 'marketplace:deactivate'
  | 'marketplace:active-resources'
  | 'marketplace:invoke-plugin'
  | 'marketplace:update'
  | 'marketplace:updates'
  | 'marketplace:rollback-update'
  | 'marketplace:finalize-update'
  | 'marketplace:qualification'

export type MarketplaceInvoke = (
  channel: MarketplaceChannel,
  request: MarketplaceFavoriteSetRequest | MarketplaceInstallRequest | MarketplaceUninstallRequest
    | MarketplaceActivationRequest | MarketplaceDeactivationRequest | MarketplacePluginInvocationRequest
    | MarketplaceUpdateDeliveryRequest | MarketplaceUpdateActionRequest | undefined,
) => Promise<unknown>

export interface MarketplaceClientPort {
  getFavorites(): Promise<MarketplaceFavoriteCollection>
  install(request: MarketplaceInstallRequest): Promise<MarketplaceInstallResult>
  listInstallations(): Promise<MarketplaceInstallationCollection>
  readCatalog(): Promise<MarketplaceCatalogReadResult>
  setFavorite(request: MarketplaceFavoriteSetRequest): Promise<MarketplaceFavoriteCollection>
  uninstall(request: MarketplaceUninstallRequest): Promise<MarketplaceInstallationCollection>
  activate(request: MarketplaceActivationRequest): Promise<MarketplaceActivationRecord>
  deactivate(request: MarketplaceDeactivationRequest): Promise<MarketplaceActiveResourceCollection>
  invokePlugin(request: MarketplacePluginInvocationRequest): Promise<MarketplacePluginInvocationResult>
  listActiveResources(): Promise<MarketplaceActiveResourceCollection>
  finalizeUpdate(request: MarketplaceUpdateActionRequest): Promise<MarketplaceUpdateRecord>
  listUpdates(): Promise<MarketplaceUpdateCollection>
  rollbackUpdate(request: MarketplaceUpdateActionRequest): Promise<MarketplaceUpdateRecord>
  update(request: MarketplaceUpdateDeliveryRequest): Promise<MarketplaceUpdateDeliveryResult>
  qualify(): Promise<MarketplacePublicationQualification>
}

export function createMarketplaceClient(
  invoke: MarketplaceInvoke = (channel, request) => window.pivot.invoke(channel, request as never),
): MarketplaceClientPort {
  return Object.freeze({
    async getFavorites() {
      return MarketplaceFavoriteCollectionSchema.parse(
        await invoke('marketplace:favorites', undefined),
      )
    },
    async qualify() {
      return MarketplacePublicationQualificationSchema.parse(await invoke('marketplace:qualification', undefined))
    },
    async activate(input: MarketplaceActivationRequest) {
      const request = MarketplaceActivationRequestSchema.parse(input)
      return MarketplaceActivationRecordSchema.parse(await invoke('marketplace:activate', request))
    },
    async deactivate(input: MarketplaceDeactivationRequest) {
      const request = MarketplaceDeactivationRequestSchema.parse(input)
      return MarketplaceActiveResourceCollectionSchema.parse(await invoke('marketplace:deactivate', request))
    },
    async invokePlugin(input: MarketplacePluginInvocationRequest) {
      const request = MarketplacePluginInvocationRequestSchema.parse(input)
      return MarketplacePluginInvocationResultSchema.parse(await invoke('marketplace:invoke-plugin', request))
    },
    async listActiveResources() {
      return MarketplaceActiveResourceCollectionSchema.parse(await invoke('marketplace:active-resources', undefined))
    },
    async finalizeUpdate(input: MarketplaceUpdateActionRequest) {
      const request = MarketplaceUpdateActionRequestSchema.parse(input)
      return MarketplaceUpdateRecordSchema.parse(await invoke('marketplace:finalize-update', request))
    },
    async listUpdates() {
      return MarketplaceUpdateCollectionSchema.parse(await invoke('marketplace:updates', undefined))
    },
    async rollbackUpdate(input: MarketplaceUpdateActionRequest) {
      const request = MarketplaceUpdateActionRequestSchema.parse(input)
      return MarketplaceUpdateRecordSchema.parse(await invoke('marketplace:rollback-update', request))
    },
    async update(input: MarketplaceUpdateDeliveryRequest) {
      const request = MarketplaceUpdateDeliveryRequestSchema.parse(input)
      return MarketplaceUpdateDeliveryResultSchema.parse(await invoke('marketplace:update', request))
    },
    async install(input: MarketplaceInstallRequest) {
      const request = MarketplaceInstallRequestSchema.parse(input)
      return MarketplaceInstallResultSchema.parse(await invoke('marketplace:install', request))
    },
    async listInstallations() {
      return MarketplaceInstallationCollectionSchema.parse(
        await invoke('marketplace:installations', undefined),
      )
    },
    async readCatalog() {
      return MarketplaceCatalogReadResultSchema.parse(
        await invoke('marketplace:catalog', undefined),
      )
    },
    async setFavorite(input: MarketplaceFavoriteSetRequest) {
      const request = MarketplaceFavoriteSetRequestSchema.parse(input)
      return MarketplaceFavoriteCollectionSchema.parse(
        await invoke('marketplace:set-favorite', request),
      )
    },
    async uninstall(input: MarketplaceUninstallRequest) {
      const request = MarketplaceUninstallRequestSchema.parse(input)
      return MarketplaceInstallationCollectionSchema.parse(
        await invoke('marketplace:uninstall', request),
      )
    },
  })
}
