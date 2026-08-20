import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeZipMarketplacePackageArchiveAdapter } from '../../src/main/services/node-zip-marketplace-package-archive-adapter'
import { VerifiedMarketplacePackageArchiveAdapter } from '../../src/main/services/verified-marketplace-package-archive-adapter'
import type { MarketplaceVerifiedStagedArtifactPort } from '../../src/main/services/marketplace-package-download-ports'
import {
  MAX_MARKETPLACE_ARCHIVE_ENTRIES,
  MAX_MARKETPLACE_EXTRACTED_BYTES,
  MarketplaceArchiveInventorySchema,
} from '../../src/shared/marketplace-archive-contracts'
import { unixModeAttributes, writeZipFixture, type ZipFixtureEntry } from '../helpers/zip-fixture'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('verified Marketplace package archive adapter', () => {
  it('inspects and extracts valid ZIP entries through stable read leases with immutable digest evidence', async () => {
    const fixture = createFixture([
      { fileName: 'pivot-package.json', data: '{"schemaVersion":1}' },
      { fileName: 'assets/' },
      { fileName: 'assets/readme.txt', data: 'hello', method: 8 },
      { fileName: 'empty.bin', data: '' },
    ])

    const extracted = await fixture.preparation.prepare(fixture.source)
    expect(path.dirname(extracted.rootPath)).toBe(fixture.extractionRoot)
    expect(readFileSync(path.join(extracted.rootPath, 'assets/readme.txt'), 'utf8')).toBe('hello')
    expect(readFileSync(path.join(extracted.rootPath, 'pivot-package.json'), 'utf8'))
      .toBe('{"schemaVersion":1}')
    expect(extracted.evidence.files.map((file) => file.path)).toEqual([
      'pivot-package.json',
      'assets/readme.txt',
      'empty.bin',
    ])
    expect(extracted.evidence.files[1]?.sha256)
      .toBe(createHash('sha256').update('hello').digest('hex'))
    expect(Object.isFrozen(extracted.evidence)).toBe(true)

    await extracted.discard()
    await extracted.discard()
    expect(readdirSync(fixture.extractionRoot)).toEqual([])
  })

  it.each([
    '../escape.txt',
    '/absolute.txt',
    'C:/drive.txt',
    'folder\\backslash.txt',
    'CON/config.json',
    'name:stream.txt',
    'trailing./file.txt',
  ])('rejects unsafe path %s without writing outside extraction root', async (fileName) => {
    const fixture = createFixture([{ fileName, data: 'blocked' }])

    await expect(fixture.preparation.prepare(fixture.source)).rejects.toThrow(/path|file ?name|archive/i)
    expect(readdirSync(fixture.extractionRoot)).toEqual([])
    expect(existsSync(path.join(fixture.root, 'escape.txt'))).toBe(false)
  })

  it('rejects symbolic links, encrypted data and unsupported compression methods', async () => {
    const cases: Array<{ entry: ZipFixtureEntry; pattern: RegExp }> = [
      {
        entry: {
          data: 'target.txt',
          externalFileAttributes: unixModeAttributes(0o120777),
          fileName: 'link',
        },
        pattern: /symbolic|entry type/i,
      },
      {
        entry: { data: Buffer.alloc(18), fileName: 'encrypted.bin', flags: 1, uncompressedSize: 6 },
        pattern: /encrypted/i,
      },
      { entry: { data: 'unknown', fileName: 'unknown.bin', method: 99 }, pattern: /compression|decode/i },
    ]

    for (const testCase of cases) {
      const fixture = createFixture([testCase.entry])
      await expect(fixture.preparation.prepare(fixture.source)).rejects.toThrow(testCase.pattern)
      expect(readdirSync(fixture.extractionRoot)).toEqual([])
    }
  })

  it('rejects case-fold duplicates, file ancestors, entry-count overflow and expansion budgets', async () => {
    const duplicate = createFixture([
      { fileName: 'A.txt', data: 'a' },
      { fileName: 'a.TXT', data: 'b' },
    ])
    await expect(duplicate.preparation.prepare(duplicate.source)).rejects.toThrow(/unique|collision/i)

    const ancestor = createFixture([
      { fileName: 'folder', data: 'file' },
      { fileName: 'folder/child.txt', data: 'child' },
    ])
    await expect(ancestor.preparation.prepare(ancestor.source)).rejects.toThrow(/ancestor|directory/i)

    const entries = Array.from({ length: MAX_MARKETPLACE_ARCHIVE_ENTRIES + 1 }, (_, index) => ({
      fileName: `many/${index}.txt`,
    }))
    const crowded = createFixture(entries)
    await expect(crowded.preparation.prepare(crowded.source)).rejects.toThrow(/entry count|entries/i)

    const bomb = createFixture([{
      data: 'x',
      fileName: 'bomb.bin',
      method: 8,
      uncompressedSize: MAX_MARKETPLACE_EXTRACTED_BYTES + 1,
    }])
    await expect(bomb.preparation.prepare(bomb.source)).rejects.toThrow(/uncompressed|budget|size/i)

    for (const fixture of [duplicate, ancestor, crowded, bomb]) {
      expect(readdirSync(fixture.extractionRoot)).toEqual([])
    }
  })

  it('re-inventories before extraction and removes partial output when inspection evidence is forged', async () => {
    const fixture = createFixture([{ fileName: 'actual.txt', data: 'actual' }])
    const forged = MarketplaceArchiveInventorySchema.parse({
      entries: [{
        compressedByteLength: 6,
        kind: 'file',
        path: 'forged.txt',
        uncompressedByteLength: 6,
      }],
      schemaVersion: 1,
      totalCompressedBytes: 6,
      totalUncompressedBytes: 6,
    })
    const policy = new VerifiedMarketplacePackageArchiveAdapter({
      extraction: fixture.nodeAdapter.openExtractionPort(),
      inspection: { inspect: async () => forged },
    }).openPreparationPort()

    await expect(policy.prepare(fixture.source)).rejects.toThrow(/inventory|changed/i)
    expect(readdirSync(fixture.extractionRoot)).toEqual([])
  })

  it('fails closed for malformed ZIPs, cancellation and staged-path replacement', async () => {
    const malformed = createFixture([{ fileName: 'ok.txt', data: 'ok' }])
    writeFileSync(malformed.archivePath, 'not a zip')
    await expect(malformed.preparation.prepare(malformed.source)).rejects.toThrow(/zip|central|archive/i)
    expect(readdirSync(malformed.extractionRoot)).toEqual([])

    const cancelled = createFixture([{ fileName: 'ok.txt', data: 'ok' }])
    const controller = new AbortController()
    controller.abort()
    await expect(cancelled.preparation.prepare(cancelled.source, controller.signal))
      .rejects.toThrow(/cancel|abort/i)
    expect(readdirSync(cancelled.extractionRoot)).toEqual([])

    const replaced = createFixture([{ fileName: 'trusted.txt', data: 'trusted' }])
    const moved = `${replaced.archivePath}.old`
    renameSync(replaced.archivePath, moved)
    writeZipFixture(replaced.archivePath, [{ fileName: 'changed.txt', data: 'changed' }])
    await expect(replaced.preparation.prepare(replaced.source)).rejects.toThrow(/identity|replaced/i)
    expect(readdirSync(replaced.extractionRoot)).toEqual([])
  })
})

function createFixture(entries: readonly ZipFixtureEntry[]) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-archive-')))
  roots.push(root)
  const archivePath = path.join(root, 'package.pivot')
  const extractionRoot = path.join(root, 'extracted')
  mkdirSync(extractionRoot)
  writeZipFixture(archivePath, entries)
  const source = createStableSource(archivePath)
  const nodeAdapter = new NodeZipMarketplacePackageArchiveAdapter({ extractionRoot })
  const preparation = new VerifiedMarketplacePackageArchiveAdapter({
    extraction: nodeAdapter.openExtractionPort(),
    inspection: nodeAdapter.openInspectionPort(),
  }).openPreparationPort()
  return { archivePath, extractionRoot, nodeAdapter, preparation, root, source }
}

function createStableSource(artifactPath: string): MarketplaceVerifiedStagedArtifactPort {
  const identity = lstatSync(artifactPath, { bigint: true })
  const bytes = readFileSync(artifactPath)
  let discarded = false
  let leases = 0
  return Object.freeze({
    artifactPath,
    async acquireReadLease() {
      if (discarded) throw new Error('Marketplace staged package was discarded')
      const handle = await open(artifactPath, 'r')
      const current = await handle.stat({ bigint: true })
      if (current.dev !== identity.dev || current.ino !== identity.ino) {
        await handle.close()
        throw new Error('Marketplace staged package identity was replaced')
      }
      leases += 1
      let released = false
      return Object.freeze({
        artifactPath,
        fileDescriptor: handle.fd,
        async release() {
          if (released) return
          released = true
          leases -= 1
          await handle.close()
        },
      })
    },
    async discard() {
      if (leases > 0) throw new Error('Marketplace staged package has an active read lease')
      discarded = true
    },
    evidence: Object.freeze({
      artifactPath,
      descriptor: {
        byteLength: statSync(artifactPath).size,
        kind: 'plugin' as const,
        resourceId: 'dev.pivot.archive-test',
        schemaVersion: 1 as const,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sourceId: 'official',
        version: '1.0.0',
      },
      signatureKeyId: 'test-key',
      status: 'verified' as const,
      verifiedAt: new Date(0).toISOString(),
    }),
  })
}
