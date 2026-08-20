import { MarketplacePackageArtifactIdentitySchema } from '../../shared/marketplace-contracts'
import {
  MarketplaceUpdateRecordSchema,
  MarketplaceUpdateStageRequestSchema,
  MarketplaceInstalledUpdateStageRequestSchema,
  type MarketplaceInstalledUpdateStageRequest,
  type MarketplaceUpdateStageRequest,
} from '../../shared/marketplace-update-contracts'
import type {
  MarketplaceInstallationLifecyclePort,
  MarketplaceInstallationPort,
  MarketplaceInstallationRegistryReaderPort,
} from './marketplace-installation-ports'
import type { MarketplaceBoundPackagePort } from './marketplace-package-binding-ports'
import type { MarketplaceCapabilityReviewEvidence } from '../../shared/marketplace-capability-contracts'
import type {
  MarketplaceResourceVersionSwitchPort,
  MarketplaceUpdateEvidencePort,
  MarketplaceUpdatePort,
} from './marketplace-update-ports'

export class MarketplaceUpdateCoordinator {
  private readonly installation: MarketplaceInstallationPort
  private readonly installations: MarketplaceInstallationRegistryReaderPort
  private readonly lifecycle: MarketplaceInstallationLifecyclePort
  private readonly switches: MarketplaceResourceVersionSwitchPort
  private readonly updates: MarketplaceUpdateEvidencePort

  constructor(options: {
    readonly installation: MarketplaceInstallationPort
    readonly installations: MarketplaceInstallationRegistryReaderPort
    readonly lifecycle: MarketplaceInstallationLifecyclePort
    readonly switches: MarketplaceResourceVersionSwitchPort
    readonly updates: MarketplaceUpdateEvidencePort
  }) {
    this.installation = options.installation
    this.installations = options.installations
    this.lifecycle = options.lifecycle
    this.switches = options.switches
    this.updates = options.updates
  }

  openUpdatePort(): MarketplaceUpdatePort {
    return Object.freeze({
      finalize: (updateId: string, expectedRevision: number) => this.finalize(updateId, expectedRevision),
      rollback: (updateId: string, expectedRevision: number) => this.rollback(updateId, expectedRevision),
      stage: (
        request: MarketplaceUpdateStageRequest,
        packagePort: MarketplaceBoundPackagePort,
        review: MarketplaceCapabilityReviewEvidence,
      ) => this.stage(request, packagePort, review),
      stageInstalled: (request: MarketplaceInstalledUpdateStageRequest) => this.stageInstalled(request),
    })
  }

  private async stageInstalled(input: unknown) {
    const request = MarketplaceInstalledUpdateStageRequestSchema.parse(input)
    const current = this.requireInstalled(request.currentIdentity, request.expectedCurrentRevision, 'current')
    const candidate = this.requireInstalled(request.candidateIdentity, request.expectedCandidateRevision, 'candidate')
    requireNewerSameResource(current.identity, candidate.identity)
    await this.switches.switchTo(candidate.identity, candidate.revision)
    return this.updates.begin({
      candidate: { identity: candidate.identity, installationRevision: candidate.revision },
      current: { identity: current.identity, installationRevision: current.revision },
    })
  }

  private requireInstalled(identity: ReturnType<typeof MarketplacePackageArtifactIdentitySchema.parse>, revision: number, role: string) {
    const record = this.installations.get(identity)
    if (!record || record.state !== 'installed') throw new Error(`Marketplace update requires an installed ${role} version`)
    if (record.revision !== revision) throw new Error(`Marketplace update ${role} installation revision is stale`)
    return record
  }

  private async stage(
    requestInput: unknown,
    packagePort: MarketplaceBoundPackagePort,
    review: MarketplaceCapabilityReviewEvidence,
  ) {
    const request = MarketplaceUpdateStageRequestSchema.parse(requestInput)
    const current = this.installations.get(request.currentIdentity)
    if (!current || current.state !== 'installed') {
      throw new Error('Marketplace update requires an installed current version')
    }
    if (current.revision !== request.expectedCurrentRevision) {
      throw new Error('Marketplace update current installation revision is stale')
    }
    const candidateIdentity = MarketplacePackageArtifactIdentitySchema.parse(
      packagePort?.manifest?.identity,
    )
    requireNewerSameResource(current.identity, candidateIdentity)

    const candidate = await this.installation.install(packagePort, review)
    let switched = false
    try {
      await this.switches.switchTo(candidate.identity, candidate.revision)
      switched = true
      return this.updates.begin({
        candidate: { identity: candidate.identity, installationRevision: candidate.revision },
        current: { identity: current.identity, installationRevision: current.revision },
      })
    } catch (error) {
      const rollbackErrors: unknown[] = []
      if (switched) {
        try { await this.switches.switchTo(current.identity, current.revision) } catch (cause) { rollbackErrors.push(cause) }
      }
      try { await this.lifecycle.uninstall(candidate.identity, candidate.revision) } catch (cause) { rollbackErrors.push(cause) }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Marketplace update failed and rollback was incomplete')
      }
      throw error
    }
  }

  private async rollback(updateId: string, expectedRevision: number) {
    const record = this.requireReady(updateId, expectedRevision)
    await this.switches.switchTo(record.current.identity, record.current.installationRevision)
    await this.lifecycle.uninstall(record.candidate.identity, record.candidate.installationRevision)
    return this.updates.transition({ expectedRevision, state: 'rolled-back', updateId })
  }

  private async finalize(updateId: string, expectedRevision: number) {
    const record = this.requireReady(updateId, expectedRevision)
    await this.lifecycle.uninstall(record.current.identity, record.current.installationRevision)
    return this.updates.transition({ expectedRevision, state: 'finalized', updateId })
  }

  private requireReady(updateId: string, expectedRevision: number) {
    const record = MarketplaceUpdateRecordSchema.parse(this.updates.find(updateId))
    if (record.state !== 'ready') throw new Error('Marketplace update is not awaiting finalization')
    if (record.revision !== expectedRevision) throw new Error('Marketplace update revision is stale')
    return record
  }
}

function requireNewerSameResource(
  current: ReturnType<typeof MarketplacePackageArtifactIdentitySchema.parse>,
  candidate: ReturnType<typeof MarketplacePackageArtifactIdentitySchema.parse>,
): void {
  if (current.sourceId !== candidate.sourceId
    || current.kind !== candidate.kind
    || current.resourceId !== candidate.resourceId) {
    throw new Error('Marketplace update candidate must be the same resource')
  }
  if (compareSemanticVersions(candidate.version, current.version) <= 0) {
    throw new Error('Marketplace update candidate must have a newer version')
  }
}

function compareSemanticVersions(left: string, right: string): number {
  const [leftCore, leftPre] = left.split('-', 2)
  const [rightCore, rightPre] = right.split('-', 2)
  const leftParts = leftCore!.split('.').map(Number)
  const rightParts = rightCore!.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index]! - rightParts[index]!
  }
  if (leftPre === undefined && rightPre !== undefined) return 1
  if (leftPre !== undefined && rightPre === undefined) return -1
  return (leftPre ?? '').localeCompare(rightPre ?? '', 'en', { numeric: true })
}
