import {
  MarketplacePublicationQualificationSchema,
  type MarketplacePublicationQualification,
} from '../../shared/marketplace-publication-qualification-contracts'
import type { MarketplaceResourceKind } from '../../shared/marketplace-contracts'
import type { MarketplaceInstallationRegistryReaderPort } from './marketplace-installation-ports'
import type { MarketplaceCatalogReaderPort } from './marketplace-ports'

const MINIMUM_CATALOG_LIFETIME_MS = 24 * 60 * 60 * 1_000

export class MarketplacePublicationQualificationService {
  private readonly activeKinds: ReadonlySet<MarketplaceResourceKind>
  private readonly catalog: MarketplaceCatalogReaderPort | null
  private readonly clock: () => Date
  private readonly installations: MarketplaceInstallationRegistryReaderPort

  constructor(options: {
    readonly activeKinds?: readonly MarketplaceResourceKind[]
    readonly catalog: MarketplaceCatalogReaderPort | null
    readonly clock?: () => Date
    readonly installations: MarketplaceInstallationRegistryReaderPort
  }) {
    this.activeKinds = new Set(options.activeKinds ?? [])
    this.catalog = options.catalog
    this.clock = options.clock ?? (() => new Date())
    this.installations = options.installations
  }

  async qualify(): Promise<MarketplacePublicationQualification> {
    const checkedAt = this.clock()
    const blockers: Array<{
      code: 'catalog-empty' | 'catalog-expiring' | 'catalog-unavailable' | 'installation-recovery-pending' | 'plugin-sandbox-unavailable' | 'resource-consumer-unavailable'
      detail: string
    }> = []
    const recoverable = this.installations.listRecoverable()
    if (recoverable.length > 0) {
      blockers.push({
        code: 'installation-recovery-pending',
        detail: `${recoverable.length} installation record(s) still require recovery`,
      })
    }
    if (!this.catalog) {
      blockers.push({ code: 'catalog-unavailable', detail: 'No verified Marketplace Catalog reader is configured' })
      return result(checkedAt, blockers)
    }
    try {
      const snapshot = await this.catalog.readSnapshot()
      if (snapshot.entries.length === 0) {
        blockers.push({ code: 'catalog-empty', detail: 'The verified Marketplace Catalog contains no resources' })
      }
      if (Date.parse(snapshot.expiresAt) - checkedAt.getTime() < MINIMUM_CATALOG_LIFETIME_MS) {
        blockers.push({ code: 'catalog-expiring', detail: 'The verified Marketplace Catalog expires in less than 24 hours' })
      }
      const kinds = new Set(snapshot.entries.map((entry) => entry.kind))
      if (kinds.has('plugin')) {
        blockers.push({
          code: 'plugin-sandbox-unavailable',
          detail: 'Plugin publication is blocked until an isolated code runtime is production-wired',
        })
      }
      for (const kind of kinds) {
        if (kind !== 'plugin' && !this.activeKinds.has(kind)) {
          blockers.push({
            code: 'resource-consumer-unavailable',
            detail: `${kind} resources do not have a production consumer registration Port`,
          })
        }
      }
      return result(checkedAt, blockers, snapshot.revision)
    } catch {
      blockers.push({ code: 'catalog-unavailable', detail: 'The verified Marketplace Catalog could not be read' })
      return result(checkedAt, blockers)
    }
  }
}

function result(
  checkedAt: Date,
  blockers: readonly { code: 'catalog-empty' | 'catalog-expiring' | 'catalog-unavailable' | 'installation-recovery-pending' | 'plugin-sandbox-unavailable' | 'resource-consumer-unavailable'; detail: string }[],
  catalogRevision?: number,
): MarketplacePublicationQualification {
  return MarketplacePublicationQualificationSchema.parse({
    blockers,
    catalogRevision,
    checkedAt: checkedAt.toISOString(),
    ready: blockers.length === 0,
    schemaVersion: 1,
  })
}
