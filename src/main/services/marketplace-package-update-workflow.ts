import {
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
import type {
  MarketplaceActivationPort,
  MarketplaceActivationRegistryReaderPort,
} from './marketplace-activation-ports'
import type { MarketplaceInstallationLifecyclePort } from './marketplace-installation-ports'
import type { MarketplacePackageDeliveryPort } from './marketplace-package-delivery-workflow'
import type { MarketplaceUpdateEvidencePort, MarketplaceUpdatePort } from './marketplace-update-ports'

export interface MarketplacePackageUpdateWorkflowPort {
  finalize(request: MarketplaceUpdateActionRequest): Promise<MarketplaceUpdateRecord>
  list(): MarketplaceUpdateCollection
  rollback(request: MarketplaceUpdateActionRequest): Promise<MarketplaceUpdateRecord>
  update(request: MarketplaceUpdateDeliveryRequest, signal?: AbortSignal): Promise<MarketplaceUpdateDeliveryResult>
}

export class MarketplacePackageUpdateWorkflow {
  private readonly activation: MarketplaceActivationPort
  private readonly activations: MarketplaceActivationRegistryReaderPort
  private readonly delivery: MarketplacePackageDeliveryPort
  private readonly evidence: MarketplaceUpdateEvidencePort
  private readonly lifecycle: MarketplaceInstallationLifecyclePort
  private readonly updates: MarketplaceUpdatePort

  constructor(options: {
    readonly activation: MarketplaceActivationPort
    readonly activations: MarketplaceActivationRegistryReaderPort
    readonly delivery: MarketplacePackageDeliveryPort
    readonly evidence: MarketplaceUpdateEvidencePort
    readonly lifecycle: MarketplaceInstallationLifecyclePort
    readonly updates: MarketplaceUpdatePort
  }) {
    this.activation = options.activation
    this.activations = options.activations
    this.delivery = options.delivery
    this.evidence = options.evidence
    this.lifecycle = options.lifecycle
    this.updates = options.updates
  }

  openPort(): MarketplacePackageUpdateWorkflowPort {
    return Object.freeze({
      finalize: (request: MarketplaceUpdateActionRequest) => this.finalize(request),
      list: () => this.list(),
      rollback: (request: MarketplaceUpdateActionRequest) => this.rollback(request),
      update: (request: MarketplaceUpdateDeliveryRequest, signal?: AbortSignal) => this.update(request, signal),
    })
  }

  private async update(input: unknown, signal?: AbortSignal): Promise<MarketplaceUpdateDeliveryResult> {
    const request = MarketplaceUpdateDeliveryRequestSchema.parse(input)
    const currentActivation = this.activations.get(request.currentIdentity)
    if (!currentActivation || currentActivation.installationRevision !== request.expectedCurrentRevision) {
      throw new Error('Marketplace update requires the exact active current version')
    }
    const delivery = await this.delivery.install({
      approvedCapabilities: request.approvedCapabilities,
      expectedCatalogRevision: request.expectedCatalogRevision,
      kind: request.kind,
      resourceId: request.resourceId,
      sourceId: request.sourceId,
    }, signal)
    if (delivery.status !== 'installed') return MarketplaceUpdateDeliveryResultSchema.parse(delivery)
    const candidate = delivery.installation
    let activated: Awaited<ReturnType<MarketplaceActivationPort['activate']>> | null = null
    try {
      activated = await this.activation.activate({
        expectedInstallationRevision: candidate.revision,
        identity: candidate.identity,
      })
      const update = await this.updates.stageInstalled({
        candidateIdentity: candidate.identity,
        currentIdentity: request.currentIdentity,
        expectedCandidateRevision: candidate.revision,
        expectedCurrentRevision: request.expectedCurrentRevision,
      })
      return MarketplaceUpdateDeliveryResultSchema.parse({ status: 'ready', update })
    } catch (error) {
      const cleanupErrors: unknown[] = []
      if (activated) {
        try {
          await this.activation.deactivate({
            expectedActivationRevision: activated.revision,
            identity: activated.identity,
          })
        } catch (cause) { cleanupErrors.push(cause) }
      }
      try { await this.lifecycle.uninstall(candidate.identity, candidate.revision) } catch (cause) { cleanupErrors.push(cause) }
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], 'Marketplace update staging failed and candidate cleanup was incomplete')
      }
      throw error
    }
  }

  private async rollback(input: unknown): Promise<MarketplaceUpdateRecord> {
    const request = MarketplaceUpdateActionRequestSchema.parse(input)
    const record = this.requireReady(request)
    const active = this.activations.get(record.candidate.identity)
    if (!active) throw new Error('Marketplace update candidate activation is missing')
    await this.activation.deactivate({ expectedActivationRevision: active.revision, identity: active.identity })
    return this.updates.rollback(record.updateId, record.revision)
  }

  private async finalize(input: unknown): Promise<MarketplaceUpdateRecord> {
    const request = MarketplaceUpdateActionRequestSchema.parse(input)
    const record = this.requireReady(request)
    const active = this.activations.get(record.current.identity)
    if (!active) throw new Error('Marketplace update rollback activation is missing')
    await this.activation.deactivate({ expectedActivationRevision: active.revision, identity: active.identity })
    return this.updates.finalize(record.updateId, record.revision)
  }

  private list(): MarketplaceUpdateCollection {
    return MarketplaceUpdateCollectionSchema.parse({ items: this.evidence.listReady(), schemaVersion: 1 })
  }

  private requireReady(request: MarketplaceUpdateActionRequest): MarketplaceUpdateRecord {
    const record = MarketplaceUpdateRecordSchema.parse(this.evidence.find(request.updateId))
    if (record.state !== 'ready' || record.revision !== request.expectedRevision) {
      throw new Error('Marketplace update evidence is stale or not ready')
    }
    return record
  }
}
