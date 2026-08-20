import { z } from 'zod'
import { MAX_MARKETPLACE_PACKAGE_BYTES } from './marketplace-contracts'

export const MAX_MARKETPLACE_ARCHIVE_ENTRIES = 4_096
export const MAX_MARKETPLACE_EXTRACTED_BYTES = MAX_MARKETPLACE_PACKAGE_BYTES
export const MAX_MARKETPLACE_ARCHIVE_PATH_LENGTH = 512
export const MAX_MARKETPLACE_ARCHIVE_PATH_DEPTH = 32

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a SHA-256 digest')

export const MarketplaceArchivePathSchema = z.string()
  .min(1)
  .max(MAX_MARKETPLACE_ARCHIVE_PATH_LENGTH)
  .refine(isSafePortableArchivePath, 'Archive path is not a safe portable relative path')

export const MarketplaceArchiveEntrySchema = z.object({
  compressedByteLength: z.number().int().nonnegative().max(MAX_MARKETPLACE_PACKAGE_BYTES),
  kind: z.enum(['directory', 'file']),
  path: MarketplaceArchivePathSchema,
  uncompressedByteLength: z.number().int().nonnegative().max(MAX_MARKETPLACE_EXTRACTED_BYTES),
}).strict().superRefine((entry, context) => {
  if (entry.kind === 'directory'
    && (entry.compressedByteLength !== 0 || entry.uncompressedByteLength !== 0)) {
    context.addIssue({
      code: 'custom',
      message: 'Archive directory entries must have zero byte lengths',
    })
  }
}).readonly()

export const MarketplaceArchiveInventorySchema = z.object({
  entries: z.array(MarketplaceArchiveEntrySchema).max(MAX_MARKETPLACE_ARCHIVE_ENTRIES).readonly(),
  schemaVersion: z.literal(1),
  totalCompressedBytes: z.number().int().nonnegative().max(MAX_MARKETPLACE_PACKAGE_BYTES),
  totalUncompressedBytes: z.number().int().nonnegative().max(MAX_MARKETPLACE_EXTRACTED_BYTES),
}).strict().superRefine((inventory, context) => {
  const compressed = inventory.entries.reduce((total, entry) => total + entry.compressedByteLength, 0)
  const uncompressed = inventory.entries.reduce((total, entry) => total + entry.uncompressedByteLength, 0)
  if (compressed !== inventory.totalCompressedBytes) {
    context.addIssue({ code: 'custom', message: 'Archive compressed total does not match its entries' })
  }
  if (uncompressed !== inventory.totalUncompressedBytes) {
    context.addIssue({ code: 'custom', message: 'Archive uncompressed total does not match its entries' })
  }

  const keys = inventory.entries.map((entry) => portablePathKey(entry.path))
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', message: 'Archive paths must be unique without case-fold collisions' })
  }
  const fileKeys = new Set(
    inventory.entries.filter((entry) => entry.kind === 'file').map((entry) => portablePathKey(entry.path)),
  )
  for (const key of keys) {
    const segments = key.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      if (fileKeys.has(segments.slice(0, index).join('/'))) {
        context.addIssue({ code: 'custom', message: 'Archive file cannot be an ancestor directory' })
        return
      }
    }
  }
}).readonly()

export const MarketplaceExtractedFileEvidenceSchema = z.object({
  byteLength: z.number().int().nonnegative().max(MAX_MARKETPLACE_EXTRACTED_BYTES),
  path: MarketplaceArchivePathSchema,
  sha256: Sha256Schema,
}).strict().readonly()

export const MarketplaceExtractedPackageEvidenceSchema = z.object({
  files: z.array(MarketplaceExtractedFileEvidenceSchema)
    .max(MAX_MARKETPLACE_ARCHIVE_ENTRIES)
    .readonly(),
  inventory: MarketplaceArchiveInventorySchema,
  schemaVersion: z.literal(1),
  totalBytes: z.number().int().nonnegative().max(MAX_MARKETPLACE_EXTRACTED_BYTES),
}).strict().superRefine((evidence, context) => {
  const expectedFiles = evidence.inventory.entries.filter((entry) => entry.kind === 'file')
  const total = evidence.files.reduce((sum, file) => sum + file.byteLength, 0)
  if (total !== evidence.totalBytes) {
    context.addIssue({ code: 'custom', message: 'Extracted byte total does not match file evidence' })
  }
  if (evidence.files.length !== expectedFiles.length) {
    context.addIssue({ code: 'custom', message: 'Extracted files do not match the archive inventory' })
    return
  }
  for (let index = 0; index < expectedFiles.length; index += 1) {
    const expected = expectedFiles[index]
    const actual = evidence.files[index]
    if (!expected || !actual
      || expected.path !== actual.path
      || expected.uncompressedByteLength !== actual.byteLength) {
      context.addIssue({
        code: 'custom',
        message: 'Extracted file path or byte length does not match the archive inventory',
      })
      return
    }
  }
}).readonly()

export type MarketplaceArchiveInventory = z.infer<typeof MarketplaceArchiveInventorySchema>
export type MarketplaceExtractedPackageEvidence = z.infer<typeof MarketplaceExtractedPackageEvidenceSchema>

function isSafePortableArchivePath(value: string): boolean {
  if (value !== value.normalize('NFC')
    || value.startsWith('/')
    || /^[A-Za-z]:/.test(value)
    || value.includes('\\')
    || /[\u0000-\u001f<>:"|?*]/.test(value)) {
    return false
  }
  const segments = value.split('/')
  if (segments.length > MAX_MARKETPLACE_ARCHIVE_PATH_DEPTH) return false
  return segments.every((segment) => segment.length > 0
    && segment !== '.'
    && segment !== '..'
    && !/[. ]$/.test(segment)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment))
}

function portablePathKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US')
}
