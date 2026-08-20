import { z } from 'zod'
import {
  MarketplaceCatalogEntrySchema,
  MarketplaceCatalogSourceSchema,
  MarketplaceStableIdentifierSchema,
} from '../shared/marketplace-contracts'

export const MarketplaceCatalogDraftSchema = z.object({
  entries: z.array(MarketplaceCatalogEntrySchema).max(10_000).readonly(),
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  source: MarketplaceCatalogSourceSchema,
}).strict().readonly()

export const MarketplaceKeysetManifestSchema = z.object({
  algorithm: z.literal('ed25519'),
  createdAt: z.string().datetime(),
  keyId: MarketplaceStableIdentifierSchema,
  publicKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  publicKeyPem: z.string().min(1).max(16_384).refine(
    (value) => value.includes('BEGIN PUBLIC KEY') && !value.includes('PRIVATE KEY'),
    'Expected an Ed25519 public key PEM without private material',
  ),
  schemaVersion: z.literal(1),
}).strict().readonly()

export type MarketplaceCatalogDraft = z.infer<typeof MarketplaceCatalogDraftSchema>
export type MarketplaceKeysetManifest = z.infer<typeof MarketplaceKeysetManifestSchema>

export interface MarketplaceKeyset {
  readonly manifest: MarketplaceKeysetManifest
  readonly privateKeyPem: string
}
