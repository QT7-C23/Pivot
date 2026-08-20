import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { lstat, mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { fromFdPromise, type Entry, type ZipFile } from 'yauzl'
import {
  MAX_MARKETPLACE_ARCHIVE_ENTRIES,
  MAX_MARKETPLACE_EXTRACTED_BYTES,
  MarketplaceArchiveInventorySchema,
  MarketplaceExtractedPackageEvidenceSchema,
  type MarketplaceArchiveInventory,
} from '../../shared/marketplace-archive-contracts'
import type {
  MarketplaceArchiveExtractionPort,
  MarketplaceArchiveExtractionRequest,
  MarketplaceArchiveInspectionPort,
  MarketplaceArchiveInspectionRequest,
  MarketplaceExtractedPackagePort,
} from './marketplace-package-archive-ports'
import type { MarketplaceStagedArtifactReadLeasePort } from './marketplace-package-download-ports'

interface StableDirectory {
  readonly dev: bigint
  readonly ino: bigint
  readonly path: string
}

interface DirectoryIdentity {
  readonly dev: bigint
  readonly ino: bigint
}

export class NodeZipMarketplacePackageArchiveAdapter {
  private readonly extractionRoot: StableDirectory

  constructor(options: { readonly extractionRoot: string }) {
    this.extractionRoot = requireStableDirectory(options.extractionRoot)
  }

  openInspectionPort(): MarketplaceArchiveInspectionPort {
    return Object.freeze({ inspect: (request: MarketplaceArchiveInspectionRequest) => this.inspect(request) })
  }

  openExtractionPort(): MarketplaceArchiveExtractionPort {
    return Object.freeze({ extract: (request: MarketplaceArchiveExtractionRequest) => this.extract(request) })
  }

  private async inspect(request: MarketplaceArchiveInspectionRequest): Promise<MarketplaceArchiveInventory> {
    requireReadLease(request?.source)
    return await inspectArchive(request.source)
  }

  private async extract(request: MarketplaceArchiveExtractionRequest): Promise<MarketplaceExtractedPackagePort> {
    requireReadLease(request?.source)
    requireNotAborted(request.signal)
    requireSameStableDirectory(this.extractionRoot)
    const expected = MarketplaceArchiveInventorySchema.parse(request.expectedInventory)
    const actual = await inspectArchive(request.source)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('Marketplace package archive inventory changed before extraction')
    }
    requireNotAborted(request.signal)

    const identifier = randomUUID()
    const partialPath = path.join(this.extractionRoot.path, `.partial-${identifier}`)
    const readyPath = path.join(this.extractionRoot.path, `.ready-${identifier}`)
    let directoryIdentity: DirectoryIdentity | undefined
    try {
      await mkdir(partialPath, { mode: 0o700 })
      directoryIdentity = await readDirectoryIdentity(partialPath)
      const evidence = await extractArchive(
        request.source,
        actual,
        partialPath,
        request.signal,
      )
      requireNotAborted(request.signal)
      await rename(partialPath, readyPath)
      return createExtractedPackagePort(
        this.extractionRoot,
        readyPath,
        directoryIdentity,
        evidence,
      )
    } catch (error) {
      if (directoryIdentity) {
        try {
          const cleanupPath = await pathWithIdentity(partialPath, readyPath, directoryIdentity)
          if (cleanupPath) await removeOwnedDirectory(this.extractionRoot, cleanupPath, directoryIdentity)
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Marketplace package extraction failed and cleanup was incomplete',
          )
        }
      }
      throw error
    }
  }
}

async function inspectArchive(
  source: MarketplaceStagedArtifactReadLeasePort,
): Promise<MarketplaceArchiveInventory> {
  const zip = await openZip(source.fileDescriptor)
  if (zip.entryCount > MAX_MARKETPLACE_ARCHIVE_ENTRIES) {
    throw new Error('Marketplace package archive entry count exceeds the configured limit')
  }
  const entries: Array<MarketplaceArchiveInventory['entries'][number]> = []
  let totalCompressedBytes = 0
  let totalUncompressedBytes = 0
  for await (const entry of zip.eachEntry()) {
    const inspected = inspectEntry(entry)
    entries.push(inspected)
    if (entries.length > MAX_MARKETPLACE_ARCHIVE_ENTRIES) {
      throw new Error('Marketplace package archive entry count exceeds the configured limit')
    }
    totalCompressedBytes += inspected.compressedByteLength
    totalUncompressedBytes += inspected.uncompressedByteLength
    if (totalUncompressedBytes > MAX_MARKETPLACE_EXTRACTED_BYTES) {
      throw new Error('Marketplace package archive exceeds the uncompressed byte budget')
    }
  }
  return MarketplaceArchiveInventorySchema.parse({
    entries,
    schemaVersion: 1,
    totalCompressedBytes,
    totalUncompressedBytes,
  })
}

function inspectEntry(entry: Entry): MarketplaceArchiveInventory['entries'][number] {
  if (entry.isEncrypted()) throw new Error('Encrypted Marketplace archive entries are not allowed')
  if (!entry.canDecodeFileData() || ![0, 8].includes(entry.compressionMethod)) {
    throw new Error('Marketplace archive entry uses an unsupported compression method')
  }
  if (!Number.isSafeInteger(entry.compressedSize) || !Number.isSafeInteger(entry.uncompressedSize)) {
    throw new Error('Marketplace archive entry size is invalid')
  }
  const isDirectory = entry.fileName.endsWith('/')
  const portablePath = isDirectory ? entry.fileName.slice(0, -1) : entry.fileName
  requireSupportedEntryType(entry, isDirectory)
  return {
    compressedByteLength: entry.compressedSize,
    kind: isDirectory ? 'directory' : 'file',
    path: portablePath,
    uncompressedByteLength: entry.uncompressedSize,
  }
}

function requireSupportedEntryType(entry: Entry, isDirectory: boolean): void {
  const platform = (entry.versionMadeBy >>> 8) & 0xff
  const unixMode = platform === 3 ? (entry.externalFileAttributes >>> 16) & 0xffff : 0
  const unixType = unixMode & 0o170000
  if (unixType === 0o120000) throw new Error('Marketplace archive symbolic links are not allowed')
  if (unixType !== 0 && unixType !== 0o040000 && unixType !== 0o100000) {
    throw new Error('Marketplace archive entry type is not a regular file or directory')
  }
  const declaredDirectory = unixType === 0o040000 || (entry.externalFileAttributes & 0x10) !== 0
  const declaredFile = unixType === 0o100000
  if ((isDirectory && declaredFile) || (!isDirectory && declaredDirectory)) {
    throw new Error('Marketplace archive entry type does not match its path')
  }
}

async function extractArchive(
  source: MarketplaceStagedArtifactReadLeasePort,
  inventory: MarketplaceArchiveInventory,
  outputRoot: string,
  signal?: AbortSignal,
) {
  const zip = await openZip(source.fileDescriptor)
  const files: Array<{ byteLength: number; path: string; sha256: string }> = []
  let index = 0
  let totalBytes = 0
  for await (const entry of zip.eachEntry()) {
    requireNotAborted(signal)
    const expected = inventory.entries[index]
    const inspected = inspectEntry(entry)
    if (!expected || JSON.stringify(inspected) !== JSON.stringify(expected)) {
      throw new Error('Marketplace package archive inventory changed during extraction')
    }
    if (expected.kind === 'directory') {
      await ensureSafeDirectory(outputRoot, expected.path)
    } else {
      const evidence = await extractFile(zip, entry, expected.path, expected.uncompressedByteLength, outputRoot, signal)
      files.push(evidence)
      totalBytes += evidence.byteLength
      if (totalBytes > MAX_MARKETPLACE_EXTRACTED_BYTES) {
        throw new Error('Marketplace package extraction exceeded the byte budget')
      }
    }
    index += 1
  }
  if (index !== inventory.entries.length) {
    throw new Error('Marketplace package archive entry count changed during extraction')
  }
  return MarketplaceExtractedPackageEvidenceSchema.parse({
    files,
    inventory,
    schemaVersion: 1,
    totalBytes,
  })
}

async function extractFile(
  zip: ZipFile,
  entry: Entry,
  relativePath: string,
  expectedBytes: number,
  outputRoot: string,
  signal?: AbortSignal,
) {
  const parent = path.posix.dirname(relativePath)
  if (parent !== '.') await ensureSafeDirectory(outputRoot, parent)
  const outputPath = path.join(outputRoot, ...relativePath.split('/'))
  const handle = await open(outputPath, 'wx', 0o600)
  const stream = await zip.openReadStreamPromise(entry)
  const digest = createHash('sha256')
  let bytesWritten = 0
  const abort = () => stream.destroy(new Error('Marketplace package archive extraction was cancelled'))
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for await (const chunk of stream) {
      requireNotAborted(signal)
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytesWritten += bytes.byteLength
      if (bytesWritten > expectedBytes) {
        throw new Error('Marketplace archive entry exceeded its declared uncompressed size')
      }
      digest.update(bytes)
      await writeAll(handle, bytes)
    }
    if (bytesWritten !== expectedBytes) {
      throw new Error('Marketplace archive entry ended before its declared uncompressed size')
    }
    await handle.sync()
    const [opened, current] = await Promise.all([
      handle.stat({ bigint: true }),
      lstat(outputPath, { bigint: true }),
    ])
    if (!opened.isFile() || current.isSymbolicLink() || !current.isFile()
      || opened.dev !== current.dev || opened.ino !== current.ino) {
      throw new Error('Marketplace extracted file identity changed while writing')
    }
  } catch (error) {
    stream.destroy()
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    await handle.close().catch(() => undefined)
  }
  return Object.freeze({ byteLength: bytesWritten, path: relativePath, sha256: digest.digest('hex') })
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    const result = await handle.write(bytes, offset, bytes.byteLength - offset)
    if (result.bytesWritten < 1) throw new Error('Marketplace archive extraction write made no progress')
    offset += result.bytesWritten
  }
}

async function ensureSafeDirectory(root: string, relativePath: string): Promise<void> {
  let current = root
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment)
    try {
      await mkdir(current, { mode: 0o700 })
    } catch (error) {
      if (!isCode(error, 'EEXIST')) throw error
    }
    const stats = await lstat(current, { bigint: true })
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Marketplace extraction parent is not a real directory')
    }
  }
}

async function openZip(fileDescriptor: number): Promise<ZipFile> {
  return await fromFdPromise(fileDescriptor, {
    autoClose: false,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  })
}

function requireReadLease(source: MarketplaceStagedArtifactReadLeasePort | undefined): void {
  if (!source || !Number.isInteger(source.fileDescriptor) || source.fileDescriptor < 0
    || typeof source.artifactPath !== 'string' || !path.isAbsolute(source.artifactPath)
    || typeof source.release !== 'function') {
    throw new Error('Marketplace archive requires a valid staged artifact read lease')
  }
}

function requireNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Marketplace package archive extraction was cancelled')
}

function requireStableDirectory(input: string): StableDirectory {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error('Marketplace extraction root must be an absolute directory')
  }
  const resolved = path.resolve(input)
  const stats = lstatSync(resolved, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Marketplace extraction root must be a real directory')
  }
  return Object.freeze({ dev: stats.dev, ino: stats.ino, path: realpathSync.native(resolved) })
}

function requireSameStableDirectory(expected: StableDirectory): void {
  const current = lstatSync(expected.path, { bigint: true })
  if (current.isSymbolicLink() || !current.isDirectory()
    || current.dev !== expected.dev || current.ino !== expected.ino) {
    throw new Error('Marketplace extraction root identity changed')
  }
}

async function readDirectoryIdentity(directoryPath: string): Promise<DirectoryIdentity> {
  const stats = await lstat(directoryPath, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Marketplace extraction output must be a real directory')
  }
  return Object.freeze({ dev: stats.dev, ino: stats.ino })
}

async function createExtractedPackagePort(
  parent: StableDirectory,
  rootPath: string,
  identity: DirectoryIdentity,
  evidence: ReturnType<typeof MarketplaceExtractedPackageEvidenceSchema.parse>,
): Promise<MarketplaceExtractedPackagePort> {
  let discarded = false
  return Object.freeze({
    async discard() {
      if (discarded) return
      await removeOwnedDirectory(parent, rootPath, identity)
      discarded = true
    },
    evidence,
    rootPath,
  })
}

async function removeOwnedDirectory(
  parent: StableDirectory,
  target: string,
  identity: DirectoryIdentity,
): Promise<void> {
  requireSameStableDirectory(parent)
  const relative = path.relative(parent.path, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
    throw new Error('Marketplace extraction cleanup target is outside its owned root')
  }
  let current
  try {
    current = await lstat(target, { bigint: true })
  } catch (error) {
    if (isCode(error, 'ENOENT')) return
    throw error
  }
  if (current.isSymbolicLink() || !current.isDirectory()
    || current.dev !== identity.dev || current.ino !== identity.ino) {
    throw new Error('Marketplace extraction output identity changed before cleanup')
  }
  await rm(target, { recursive: true })
}

async function pathWithIdentity(
  first: string,
  second: string,
  identity: DirectoryIdentity,
): Promise<string | null> {
  for (const candidate of [first, second]) {
    try {
      const stats = await lstat(candidate, { bigint: true })
      if (stats.dev === identity.dev && stats.ino === identity.ino) return candidate
    } catch (error) {
      if (!isCode(error, 'ENOENT')) throw error
    }
  }
  return null
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
