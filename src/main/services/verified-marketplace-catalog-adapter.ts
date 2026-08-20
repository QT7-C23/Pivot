import {
  MarketplaceCatalogPayloadSchema,
  MarketplaceCatalogSnapshotSchema,
  serializeMarketplaceCatalogPayload,
  type MarketplaceCatalogPayload,
  type MarketplaceCatalogSnapshot,
} from '../../shared/marketplace-contracts'
import type {
  MarketplaceCatalogCachePort,
  MarketplaceCatalogTransportPort,
  MarketplaceCatalogTrustReaderPort,
  MarketplaceTrustedCatalogSource,
} from './marketplace-catalog-ports'
import type { MarketplaceCatalogReaderPort } from './marketplace-ports'

export class MarketplaceCatalogUnavailableError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'MarketplaceCatalogUnavailableError'
  }
}

export class VerifiedMarketplaceCatalogAdapter {
  private readonly cache: MarketplaceCatalogCachePort
  private readonly clock: () => Date
  private readonly sourceId: string
  private readonly transport: MarketplaceCatalogTransportPort
  private readonly trust: MarketplaceCatalogTrustReaderPort

  constructor(options: {
    cache: MarketplaceCatalogCachePort
    clock?: () => Date
    sourceId: string
    transport: MarketplaceCatalogTransportPort
    trust: MarketplaceCatalogTrustReaderPort
  }) {
    this.cache = options.cache
    this.clock = options.clock ?? (() => new Date())
    this.sourceId = options.sourceId
    this.transport = options.transport
    this.trust = options.trust
  }

  openReaderPort(): MarketplaceCatalogReaderPort {
    return Object.freeze({ readSnapshot: () => this.readSnapshot() })
  }

  private async readSnapshot(): Promise<MarketplaceCatalogSnapshot> {
    const source = this.trust.getSource(this.sourceId)
    if (!source) throw new Error(`Marketplace Catalog source is not trusted: ${this.sourceId}`)
    const cached = this.cache.read(source.id)

    let remoteInput: unknown
    try {
      remoteInput = await this.transport.fetchJson(source.catalogUrl)
    } catch (transportError) {
      if (!cached) {
        throw new MarketplaceCatalogUnavailableError(
          'Marketplace Catalog is unavailable and no verified cache exists',
          { cause: transportError },
        )
      }
      try {
        return this.verifySnapshot(cached, source, true)
      } catch (cacheError) {
        throw new MarketplaceCatalogUnavailableError(
          'Marketplace Catalog is unavailable and cached evidence is unusable',
          { cause: new AggregateError([transportError, cacheError]) },
        )
      }
    }

    const remote = this.verifySnapshot(remoteInput, source, true)
    if (cached) this.assertMonotonicRevision(cached, remote, source)
    this.cache.write(remote)
    return remote
  }

  private verifySnapshot(
    input: unknown,
    trusted: MarketplaceTrustedCatalogSource,
    requireFresh: boolean,
  ): MarketplaceCatalogSnapshot {
    const snapshot = MarketplaceCatalogSnapshotSchema.parse(input)
    if (
      snapshot.source.id !== trusted.id
      || snapshot.source.catalogUrl !== trusted.catalogUrl
      || snapshot.source.trust.keyId !== trusted.keyId
      || snapshot.signature.keyId !== trusted.keyId
    ) {
      throw new Error('Marketplace Catalog snapshot does not match its trusted source')
    }
    const payload = payloadOf(snapshot)
    if (!this.trust.verify({
      keyId: snapshot.signature.keyId,
      payload: serializeMarketplaceCatalogPayload(payload),
      signature: snapshot.signature.value,
      sourceId: snapshot.source.id,
    })) {
      throw new Error('Marketplace Catalog signature is invalid')
    }

    const now = this.clock().getTime()
    if (now < Date.parse(snapshot.generatedAt)) {
      throw new Error('Marketplace Catalog snapshot is not valid yet because it was generated in the future')
    }
    if (requireFresh && now >= Date.parse(snapshot.expiresAt)) {
      throw new Error('Marketplace Catalog snapshot has expired')
    }
    return snapshot
  }

  private assertMonotonicRevision(
    cachedInput: MarketplaceCatalogSnapshot,
    remote: MarketplaceCatalogSnapshot,
    source: MarketplaceTrustedCatalogSource,
  ): void {
    const cached = this.verifySnapshot(cachedInput, source, false)
    if (remote.revision < cached.revision) {
      throw new Error(`Marketplace Catalog revision rollback: ${remote.revision} < ${cached.revision}`)
    }
    if (
      remote.revision === cached.revision
      && serializeMarketplaceCatalogPayload(payloadOf(remote))
        !== serializeMarketplaceCatalogPayload(payloadOf(cached))
    ) {
      throw new Error(`Marketplace Catalog revision equivocation: ${remote.revision}`)
    }
  }
}

function payloadOf(snapshot: MarketplaceCatalogSnapshot): MarketplaceCatalogPayload {
  return MarketplaceCatalogPayloadSchema.parse({
    entries: snapshot.entries,
    expiresAt: snapshot.expiresAt,
    generatedAt: snapshot.generatedAt,
    revision: snapshot.revision,
    schemaVersion: snapshot.schemaVersion,
    source: snapshot.source,
  })
}
