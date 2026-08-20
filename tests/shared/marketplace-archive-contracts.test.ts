import { describe, expect, it } from 'vitest'
import {
  MarketplaceArchiveInventorySchema,
  MarketplaceExtractedPackageEvidenceSchema,
} from '../../src/shared/marketplace-archive-contracts'

describe('Marketplace archive contracts', () => {
  it('accepts one strict bounded inventory and cross-checks extraction evidence', () => {
    const inventory = MarketplaceArchiveInventorySchema.parse({
      entries: [
        { compressedByteLength: 0, kind: 'directory', path: 'assets', uncompressedByteLength: 0 },
        { compressedByteLength: 3, kind: 'file', path: 'assets/a.txt', uncompressedByteLength: 3 },
      ],
      schemaVersion: 1,
      totalCompressedBytes: 3,
      totalUncompressedBytes: 3,
    })

    expect(MarketplaceExtractedPackageEvidenceSchema.parse({
      files: [{ byteLength: 3, path: 'assets/a.txt', sha256: 'a'.repeat(64) }],
      inventory,
      schemaVersion: 1,
      totalBytes: 3,
    }).files).toHaveLength(1)
  })

  it.each([
    '../escape',
    '/absolute',
    'C:/drive.txt',
    '\\\\server\\share',
    'a\\b.txt',
    'a//b.txt',
    'a/./b.txt',
    'a/../b.txt',
    'a/b. ',
    'CON/config.json',
    'a:b.txt',
  ])('rejects unsafe portable archive path %s', (unsafePath) => {
    expect(() => MarketplaceArchiveInventorySchema.parse({
      entries: [{
        compressedByteLength: 1,
        kind: 'file',
        path: unsafePath,
        uncompressedByteLength: 1,
      }],
      schemaVersion: 1,
      totalCompressedBytes: 1,
      totalUncompressedBytes: 1,
    })).toThrow()
  })

  it('rejects unknown fields, case-fold collisions, file ancestors and inconsistent totals', () => {
    const base = {
      schemaVersion: 1 as const,
      totalCompressedBytes: 2,
      totalUncompressedBytes: 2,
    }
    expect(() => MarketplaceArchiveInventorySchema.parse({
      ...base,
      entries: [
        { compressedByteLength: 1, kind: 'file', path: 'A.txt', uncompressedByteLength: 1 },
        { compressedByteLength: 1, kind: 'file', path: 'a.TXT', uncompressedByteLength: 1 },
      ],
    })).toThrow(/unique|collision/i)
    expect(() => MarketplaceArchiveInventorySchema.parse({
      ...base,
      entries: [
        { compressedByteLength: 1, kind: 'file', path: 'folder', uncompressedByteLength: 1 },
        { compressedByteLength: 1, kind: 'file', path: 'folder/a', uncompressedByteLength: 1 },
      ],
    })).toThrow(/ancestor|directory/i)
    expect(() => MarketplaceArchiveInventorySchema.parse({
      ...base,
      entries: [{
        compressedByteLength: 1,
        kind: 'file',
        path: 'a.txt',
        uncompressedByteLength: 1,
        outputPath: 'injected',
      }],
    })).toThrow()
    expect(() => MarketplaceArchiveInventorySchema.parse({
      ...base,
      entries: [{ compressedByteLength: 1, kind: 'file', path: 'a.txt', uncompressedByteLength: 1 }],
    })).toThrow(/total/i)
  })

  it('rejects extracted evidence that omits, adds or changes inventory files', () => {
    const inventory = MarketplaceArchiveInventorySchema.parse({
      entries: [{ compressedByteLength: 3, kind: 'file', path: 'a.txt', uncompressedByteLength: 3 }],
      schemaVersion: 1,
      totalCompressedBytes: 3,
      totalUncompressedBytes: 3,
    })
    expect(() => MarketplaceExtractedPackageEvidenceSchema.parse({
      files: [{ byteLength: 2, path: 'a.txt', sha256: 'a'.repeat(64) }],
      inventory,
      schemaVersion: 1,
      totalBytes: 2,
    })).toThrow(/inventory|byte length/i)
  })
})
