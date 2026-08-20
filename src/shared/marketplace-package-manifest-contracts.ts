import { z } from 'zod'
import { MarketplaceArchivePathSchema } from './marketplace-archive-contracts'
import {
  MarketplacePackageArtifactIdentitySchema,
  MarketplaceStableIdentifierSchema,
} from './marketplace-contracts'

export const MARKETPLACE_PACKAGE_MANIFEST_PATH = 'pivot-package.json'
export const MAX_MARKETPLACE_PACKAGE_MANIFEST_BYTES = 256 * 1024

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a SHA-256 digest')

export const MarketplaceCapabilitySchema = z.enum([
  'mcp.connect',
  'network.fetch',
  'process.spawn',
  'secrets.read',
  'ui.contribute',
  'workspace.read',
  'workspace.write',
])

export const MarketplacePackageManifestFileSchema = z.object({
  byteLength: z.number().int().nonnegative().max(512 * 1024 * 1024),
  path: MarketplaceArchivePathSchema,
  sha256: Sha256Schema,
}).strict().readonly()

export const MarketplacePackageManifestSchema = z.object({
  capabilities: z.array(MarketplaceCapabilitySchema).max(32).readonly(),
  entrypoint: MarketplaceArchivePathSchema,
  files: z.array(MarketplacePackageManifestFileSchema).min(1).max(4_095).readonly(),
  identity: MarketplacePackageArtifactIdentitySchema,
  publisherId: MarketplaceStableIdentifierSchema,
  schemaVersion: z.literal(1),
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    context.addIssue({ code: 'custom', message: 'Manifest capabilities must be unique' })
  }
  const keys = manifest.files.map((file) => portableKey(file.path))
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', message: 'Manifest file paths must be unique without case-fold collisions' })
  }
  if (keys.includes(portableKey(MARKETPLACE_PACKAGE_MANIFEST_PATH))) {
    context.addIssue({ code: 'custom', message: 'Manifest cannot declare itself as a payload file' })
  }
  if (!keys.includes(portableKey(manifest.entrypoint))) {
    context.addIssue({ code: 'custom', message: 'Manifest entrypoint must identify one declared payload file' })
  }
}).readonly()

export type MarketplaceCapability = z.infer<typeof MarketplaceCapabilitySchema>
export type MarketplacePackageManifest = z.infer<typeof MarketplacePackageManifestSchema>

function portableKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US')
}
