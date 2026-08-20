import { z } from 'zod'

export const MarketplaceStableIdentifierSchema = z.string().trim().min(1).max(160).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  'Expected a stable identifier without paths or whitespace',
)
const StableIdentifierSchema = MarketplaceStableIdentifierSchema
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)
const SemanticVersionSchema = z.string().trim().regex(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  'Expected a semantic version',
)
const HttpsUrlSchema = z.url().refine(
  (value) => value.startsWith('https://'),
  'Expected an HTTPS URL',
)
const Sha256Schema = z.string().regex(
  /^[a-f0-9]{64}$/,
  'Expected a SHA-256 digest',
)
const SignatureValueSchema = z.string().trim().regex(
  /^[A-Za-z0-9+/]{86}==$/,
  'Expected a base64-encoded 64-byte Ed25519 signature',
)
const MAX_CATALOG_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000
export const MAX_MARKETPLACE_PACKAGE_BYTES = 512 * 1024 * 1024
const MARKETPLACE_PACKAGE_SIGNATURE_DOMAIN = 'pivot-marketplace-package:v1'

export const MarketplaceResourceKindSchema = z.enum(['plugin', 'skill', 'prompt', 'theme'])

export const MarketplacePackageArtifactIdentitySchema = z.object({
  kind: MarketplaceResourceKindSchema,
  resourceId: StableIdentifierSchema,
  schemaVersion: z.literal(1),
  sourceId: StableIdentifierSchema,
  version: SemanticVersionSchema,
}).strict().readonly()

export const MarketplacePackageArtifactDescriptorSchema = z.object({
  byteLength: z.number().int().positive().max(MAX_MARKETPLACE_PACKAGE_BYTES),
  kind: MarketplaceResourceKindSchema,
  resourceId: StableIdentifierSchema,
  schemaVersion: z.literal(1),
  sha256: Sha256Schema,
  sourceId: StableIdentifierSchema,
  version: SemanticVersionSchema,
}).strict().readonly()

export const MarketplaceSignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  keyId: StableIdentifierSchema,
  value: SignatureValueSchema,
}).strict().readonly()

export const MarketplaceSignedPackageArtifactSchema = z.object({
  descriptor: MarketplacePackageArtifactDescriptorSchema,
  signature: MarketplaceSignatureSchema,
}).strict().readonly()

export const MarketplacePackageDownloadIntentSchema = z.object({
  descriptor: MarketplacePackageArtifactDescriptorSchema,
  downloadUrl: HttpsUrlSchema,
  schemaVersion: z.literal(1),
  signature: MarketplaceSignatureSchema,
}).strict().readonly()

export const MarketplaceCatalogSourceSchema = z.object({
  catalogUrl: HttpsUrlSchema,
  displayName: z.string().trim().min(1).max(160),
  id: StableIdentifierSchema,
  schemaVersion: z.literal(1),
  trust: z.object({
    algorithm: z.literal('ed25519'),
    keyId: StableIdentifierSchema,
  }).strict().readonly(),
}).strict().readonly()

export const MarketplaceCatalogEntrySchema = z.object({
  compatibility: z.object({
    maxPivotVersion: SemanticVersionSchema.optional(),
    minPivotVersion: SemanticVersionSchema,
  }).strict().readonly(),
  description: z.string().trim().min(1).max(4_000),
  distribution: z.object({
    free: z.literal(true),
    sponsorshipUrl: HttpsUrlSchema.optional(),
  }).strict().readonly(),
  kind: MarketplaceResourceKindSchema,
  manifestUrl: HttpsUrlSchema,
  name: z.string().trim().min(1).max(160),
  package: z.object({
    byteLength: z.number().int().positive().max(MAX_MARKETPLACE_PACKAGE_BYTES),
    downloadUrl: HttpsUrlSchema,
    sha256: Sha256Schema,
    signature: MarketplaceSignatureSchema,
  }).strict().readonly(),
  publisher: z.object({
    id: StableIdentifierSchema,
    name: z.string().trim().min(1).max(160),
    url: HttpsUrlSchema.optional(),
  }).strict().readonly(),
  resourceId: StableIdentifierSchema,
  schemaVersion: z.literal(1),
  sourceId: StableIdentifierSchema,
  tags: z.array(z.string().trim().min(1).max(64)).max(32).readonly(),
  updatedAt: TimestampSchema,
  version: SemanticVersionSchema,
}).strict().superRefine((entry, context) => {
  if (new Set(entry.tags).size !== entry.tags.length) {
    context.addIssue({ code: 'custom', message: 'Catalog entry tags must be unique', path: ['tags'] })
  }
}).readonly()

const MarketplaceCatalogPayloadFields = {
  entries: z.array(MarketplaceCatalogEntrySchema).max(10_000).readonly(),
  expiresAt: TimestampSchema,
  generatedAt: TimestampSchema,
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  source: MarketplaceCatalogSourceSchema,
} as const

export const MarketplaceCatalogPayloadSchema = z.object(
  MarketplaceCatalogPayloadFields,
).strict().superRefine(validateCatalogPayload).readonly()

export const MarketplaceCatalogSnapshotSchema = z.object({
  ...MarketplaceCatalogPayloadFields,
  signature: MarketplaceSignatureSchema,
}).strict().superRefine((snapshot, context) => {
  validateCatalogPayload(snapshot, context)
  if (snapshot.signature.keyId !== snapshot.source.trust.keyId) {
    context.addIssue({
      code: 'custom',
      message: 'Catalog signature key must match the trusted source key',
      path: ['signature', 'keyId'],
    })
  }
}).readonly()

export const MarketplaceCatalogReadResultSchema = z.discriminatedUnion('status', [
  z.object({
    snapshot: MarketplaceCatalogSnapshotSchema,
    status: z.literal('available'),
  }).strict().readonly(),
  z.object({
    message: z.string().trim().min(1).max(500).optional(),
    reason: z.enum(['unconfigured', 'read-failed']),
    status: z.literal('unavailable'),
  }).strict().readonly(),
])

function validateCatalogPayload(
  snapshot: {
    readonly entries: readonly z.infer<typeof MarketplaceCatalogEntrySchema>[]
    readonly expiresAt: string
    readonly generatedAt: string
    readonly source: z.infer<typeof MarketplaceCatalogSourceSchema>
  },
  context: z.RefinementCtx,
): void {
  if (Date.parse(snapshot.expiresAt) <= Date.parse(snapshot.generatedAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Catalog snapshot expiry must be after generation',
      path: ['expiresAt'],
    })
  }
  if (Date.parse(snapshot.expiresAt) - Date.parse(snapshot.generatedAt) > MAX_CATALOG_LIFETIME_MS) {
    context.addIssue({
      code: 'custom',
      message: 'Catalog snapshot lifetime cannot exceed 7 days',
      path: ['expiresAt'],
    })
  }
  const resourceKeys = new Set<string>()
  snapshot.entries.forEach((entry, index) => {
    if (entry.sourceId !== snapshot.source.id) {
      context.addIssue({
        code: 'custom',
        message: 'Catalog entry source must match the snapshot source',
        path: ['entries', index, 'sourceId'],
      })
    }
    if (entry.package.signature.keyId !== snapshot.source.trust.keyId) {
      context.addIssue({
        code: 'custom',
        message: 'Package signature key must match the trusted source key',
        path: ['entries', index, 'package', 'signature', 'keyId'],
      })
    }
    const resourceKey = `${entry.kind}:${entry.resourceId}`
    if (resourceKeys.has(resourceKey)) {
      context.addIssue({
        code: 'custom',
        message: 'Catalog resource keys must be unique',
        path: ['entries', index, 'resourceId'],
      })
    }
    resourceKeys.add(resourceKey)
  })
}

export const MarketplaceFavoriteSchema = z.object({
  createdAt: TimestampSchema,
  kind: MarketplaceResourceKindSchema,
  resourceId: StableIdentifierSchema,
  sourceId: StableIdentifierSchema,
}).strict().readonly()

export const MarketplaceFavoriteCollectionSchema = z.object({
  items: z.array(MarketplaceFavoriteSchema).max(10_000).readonly(),
  revision: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
  updatedAt: TimestampSchema,
}).strict().superRefine((collection, context) => {
  const keys = collection.items.map(favoriteKey)
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', message: 'Favorite resource keys must be unique', path: ['items'] })
  }
}).readonly()

export const MarketplaceFavoriteSetRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  favorite: z.boolean(),
  kind: MarketplaceResourceKindSchema,
  resourceId: StableIdentifierSchema,
  sourceId: StableIdentifierSchema,
}).strict().readonly()

export type MarketplaceCatalogPayload = z.infer<typeof MarketplaceCatalogPayloadSchema>
export type MarketplacePackageArtifactDescriptor = z.infer<typeof MarketplacePackageArtifactDescriptorSchema>
export type MarketplacePackageArtifactIdentity = z.infer<typeof MarketplacePackageArtifactIdentitySchema>
export type MarketplacePackageDownloadIntent = z.infer<typeof MarketplacePackageDownloadIntentSchema>
export type MarketplaceSignedPackageArtifact = z.infer<typeof MarketplaceSignedPackageArtifactSchema>
export type MarketplaceSignature = z.infer<typeof MarketplaceSignatureSchema>
export type MarketplaceResourceKind = z.infer<typeof MarketplaceResourceKindSchema>
export type MarketplaceCatalogSource = z.infer<typeof MarketplaceCatalogSourceSchema>
export type MarketplaceCatalogEntry = z.infer<typeof MarketplaceCatalogEntrySchema>
export type MarketplaceCatalogSnapshot = z.infer<typeof MarketplaceCatalogSnapshotSchema>
export type MarketplaceCatalogReadResult = z.infer<typeof MarketplaceCatalogReadResultSchema>
export type MarketplaceFavorite = z.infer<typeof MarketplaceFavoriteSchema>
export type MarketplaceFavoriteCollection = z.infer<typeof MarketplaceFavoriteCollectionSchema>
export type MarketplaceFavoriteSetRequest = z.infer<typeof MarketplaceFavoriteSetRequestSchema>

export function serializeMarketplaceCatalogPayload(input: unknown): string {
  return JSON.stringify(MarketplaceCatalogPayloadSchema.parse(input))
}

export function serializeMarketplacePackageArtifactDescriptor(input: unknown): string {
  return `${MARKETPLACE_PACKAGE_SIGNATURE_DOMAIN}\n${JSON.stringify(
    MarketplacePackageArtifactDescriptorSchema.parse(input),
  )}`
}

export function marketplacePackageArtifactDescriptorFromCatalogEntry(
  input: unknown,
): MarketplacePackageArtifactDescriptor {
  const entry = MarketplaceCatalogEntrySchema.parse(input)
  return MarketplacePackageArtifactDescriptorSchema.parse({
    byteLength: entry.package.byteLength,
    kind: entry.kind,
    resourceId: entry.resourceId,
    schemaVersion: 1,
    sha256: entry.package.sha256,
    sourceId: entry.sourceId,
    version: entry.version,
  })
}

export function marketplacePackageDownloadIntentFromCatalogEntry(
  input: unknown,
): MarketplacePackageDownloadIntent {
  const entry = MarketplaceCatalogEntrySchema.parse(input)
  return MarketplacePackageDownloadIntentSchema.parse({
    descriptor: marketplacePackageArtifactDescriptorFromCatalogEntry(entry),
    downloadUrl: entry.package.downloadUrl,
    schemaVersion: 1,
    signature: entry.package.signature,
  })
}

function favoriteKey(item: Pick<MarketplaceFavorite, 'kind' | 'resourceId' | 'sourceId'>): string {
  return `${item.sourceId}:${item.kind}:${item.resourceId}`
}
