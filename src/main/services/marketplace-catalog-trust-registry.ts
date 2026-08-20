import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import {
  MarketplaceCatalogSourceSchema,
  MarketplaceSignatureSchema,
  type MarketplaceCatalogSource,
} from '../../shared/marketplace-contracts'
import type {
  MarketplaceCatalogSignatureVerificationRequest,
  MarketplaceCatalogTrustReaderPort,
  MarketplaceTrustedCatalogSource,
} from './marketplace-catalog-ports'

export interface MarketplaceTrustedCatalogConfig {
  readonly publicKeyPem: string
  readonly source: MarketplaceCatalogSource
}

interface TrustedCatalogRecord {
  readonly key: KeyObject
  readonly source: MarketplaceTrustedCatalogSource
}

export class MarketplaceCatalogTrustRegistry {
  private readonly records: ReadonlyMap<string, TrustedCatalogRecord>

  constructor(configs: readonly MarketplaceTrustedCatalogConfig[]) {
    if (configs.length < 1 || configs.length > 64) {
      throw new Error('Marketplace trust registry requires 1-64 configured sources')
    }
    const records = new Map<string, TrustedCatalogRecord>()
    for (const config of configs) {
      const source = MarketplaceCatalogSourceSchema.parse(config.source)
      if (records.has(source.id)) {
        throw new Error(`Marketplace trusted source must be unique: ${source.id}`)
      }
      if (typeof config.publicKeyPem !== 'string' || config.publicKeyPem.length > 16_384) {
        throw new Error(`Marketplace trusted source has an invalid public key: ${source.id}`)
      }
      let key: KeyObject
      try {
        key = createPublicKey(config.publicKeyPem)
      } catch (error) {
        throw new Error(`Marketplace trusted source public key is invalid: ${source.id}`, { cause: error })
      }
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new Error(`Marketplace trusted source requires an Ed25519 public key: ${source.id}`)
      }
      records.set(source.id, Object.freeze({
        key,
        source: Object.freeze({
          catalogUrl: source.catalogUrl,
          id: source.id,
          keyId: source.trust.keyId,
        }),
      }))
    }
    this.records = records
  }

  openReaderPort(): MarketplaceCatalogTrustReaderPort {
    return Object.freeze({
      getSource: (sourceId: string) => this.getSource(sourceId),
      verify: (request: MarketplaceCatalogSignatureVerificationRequest) => this.verify(request),
    })
  }

  private getSource(sourceId: string): MarketplaceTrustedCatalogSource | null {
    return this.records.get(sourceId)?.source ?? null
  }

  private verify(request: MarketplaceCatalogSignatureVerificationRequest): boolean {
    const record = this.records.get(request.sourceId)
    if (!record || request.keyId !== record.source.keyId) return false
    let signature: string
    try {
      signature = MarketplaceSignatureSchema.parse({
        algorithm: 'ed25519',
        keyId: request.keyId,
        value: request.signature,
      }).value
    } catch {
      return false
    }
    return verify(
      null,
      Buffer.from(request.payload, 'utf8'),
      record.key,
      Buffer.from(signature, 'base64'),
    )
  }
}
