import { z } from 'zod'
import {
  MarketplaceCatalogPayloadSchema,
  MarketplaceCatalogSnapshotSchema,
  MarketplacePackageArtifactDescriptorSchema,
  MarketplaceSignedPackageArtifactSchema,
  MarketplaceStableIdentifierSchema,
  serializeMarketplaceCatalogPayload,
  serializeMarketplacePackageArtifactDescriptor,
  type MarketplaceCatalogSnapshot,
  type MarketplaceSignedPackageArtifact,
} from '../shared/marketplace-contracts'
import {
  MarketplaceCatalogDraftSchema,
  MarketplaceKeysetManifestSchema,
  type MarketplaceKeyset,
} from './marketplace-publisher-contracts'
import type { MarketplacePublisherCryptoPort } from './marketplace-publisher-ports'

const DEFAULT_LIFETIME_HOURS = 144
const MAX_LIFETIME_HOURS = 168
const KeysetRequestSchema = z.object({
  keyId: MarketplaceStableIdentifierSchema,
}).strict().readonly()
const LifetimeHoursSchema = z.number().int().min(1).max(
  MAX_LIFETIME_HOURS,
  `Marketplace Catalog lifetime cannot exceed ${MAX_LIFETIME_HOURS} hours`,
)

export class MarketplacePublisher {
  private readonly clock: () => Date
  private readonly crypto: MarketplacePublisherCryptoPort

  constructor(options: {
    readonly clock?: () => Date
    readonly crypto: MarketplacePublisherCryptoPort
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.crypto = options.crypto
  }

  createKeyset(input: unknown): MarketplaceKeyset {
    const request = KeysetRequestSchema.parse(input)
    const createdAt = this.now().toISOString()
    const generated = this.crypto.generateEd25519KeyPair()
    const descriptor = this.crypto.describeEd25519PrivateKey(generated.privateKeyPem)
    if (
      descriptor.publicKeyFingerprint !== generated.publicKeyFingerprint
      || descriptor.publicKeyPem !== generated.publicKeyPem
    ) {
      throw new Error('Generated Marketplace keyset is internally inconsistent')
    }
    const challenge = `pivot-marketplace-keyset:${request.keyId}:${createdAt}`
    const signature = this.crypto.signUtf8(challenge, generated.privateKeyPem)
    if (!this.crypto.verifyUtf8(challenge, signature, generated.publicKeyPem)) {
      throw new Error('Generated Marketplace keyset failed self-verification')
    }
    return Object.freeze({
      manifest: MarketplaceKeysetManifestSchema.parse({
        algorithm: 'ed25519',
        createdAt,
        keyId: request.keyId,
        publicKeyFingerprint: generated.publicKeyFingerprint,
        publicKeyPem: generated.publicKeyPem,
        schemaVersion: 1,
      }),
      privateKeyPem: generated.privateKeyPem,
    })
  }

  signCatalog(input: {
    readonly draft: unknown
    readonly keyset: MarketplaceKeyset
    readonly lifetimeHours?: number
  }): MarketplaceCatalogSnapshot {
    const draft = MarketplaceCatalogDraftSchema.parse(input.draft)
    const manifest = this.validateKeyset(input.keyset)
    const lifetimeHours = LifetimeHoursSchema.parse(
      input.lifetimeHours ?? DEFAULT_LIFETIME_HOURS,
    )
    if (draft.source.trust.keyId !== manifest.keyId) {
      throw new Error('Marketplace Catalog source key does not match the keyset manifest')
    }
    const generatedAtDate = this.now()
    const payload = MarketplaceCatalogPayloadSchema.parse({
      entries: draft.entries,
      expiresAt: new Date(generatedAtDate.getTime() + lifetimeHours * 60 * 60 * 1_000).toISOString(),
      generatedAt: generatedAtDate.toISOString(),
      revision: draft.revision,
      schemaVersion: draft.schemaVersion,
      source: draft.source,
    })
    const serialized = serializeMarketplaceCatalogPayload(payload)
    const signature = this.crypto.signUtf8(serialized, input.keyset.privateKeyPem)
    if (!this.crypto.verifyUtf8(serialized, signature, manifest.publicKeyPem)) {
      throw new Error('Signed Marketplace Catalog failed self-verification')
    }
    return MarketplaceCatalogSnapshotSchema.parse({
      ...payload,
      signature: {
        algorithm: 'ed25519',
        keyId: manifest.keyId,
        value: signature,
      },
    })
  }

  signPackageArtifact(input: {
    readonly descriptor: unknown
    readonly keyset: MarketplaceKeyset
  }): MarketplaceSignedPackageArtifact {
    const descriptor = MarketplacePackageArtifactDescriptorSchema.parse(input.descriptor)
    const manifest = this.validateKeyset(input.keyset)
    const serialized = serializeMarketplacePackageArtifactDescriptor(descriptor)
    const signature = this.crypto.signUtf8(serialized, input.keyset.privateKeyPem)
    if (!this.crypto.verifyUtf8(serialized, signature, manifest.publicKeyPem)) {
      throw new Error('Signed Marketplace package artifact failed self-verification')
    }
    return MarketplaceSignedPackageArtifactSchema.parse({
      descriptor,
      signature: {
        algorithm: 'ed25519',
        keyId: manifest.keyId,
        value: signature,
      },
    })
  }

  private validateKeyset(keyset: MarketplaceKeyset) {
    const manifest = MarketplaceKeysetManifestSchema.parse(keyset.manifest)
    const descriptor = this.crypto.describeEd25519PrivateKey(keyset.privateKeyPem)
    if (
      descriptor.publicKeyFingerprint !== manifest.publicKeyFingerprint
      || descriptor.publicKeyPem !== manifest.publicKeyPem
    ) {
      throw new Error('Marketplace keyset private key does not match its public manifest')
    }
    return manifest
  }

  private now(): Date {
    const value = this.clock()
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error('Marketplace publisher clock returned an invalid date')
    }
    return new Date(value.getTime())
  }
}
