import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { MarketplaceExtractedPackageEvidenceSchema } from '../../shared/marketplace-archive-contracts'
import { MarketplacePackageArtifactIdentitySchema, type MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import type {
  MarketplaceInstallationStoragePort,
  MarketplaceInstallationStorageStageRequest,
  MarketplaceStagedInstallationPort,
} from './marketplace-installation-ports'

interface StableDirectory { readonly dev: bigint; readonly ino: bigint; readonly path: string }
interface DirectoryIdentity { readonly dev: bigint; readonly ino: bigint }

export class NodeMarketplaceInstallationStorageAdapter {
  private readonly installRoot: StableDirectory

  constructor(options: { readonly installRoot: string }) {
    this.installRoot = stableDirectory(options.installRoot)
  }

  openStoragePort(): MarketplaceInstallationStoragePort {
    return Object.freeze({
      exists: (identity: MarketplacePackageArtifactIdentity) => this.exists(identity),
      keyFor: (identity: MarketplacePackageArtifactIdentity) => storageKey(identity),
      remove: (identity: MarketplacePackageArtifactIdentity) => this.remove(identity),
      stage: (request: MarketplaceInstallationStorageStageRequest) => this.stage(request),
    })
  }

  private async stage(request: MarketplaceInstallationStorageStageRequest): Promise<MarketplaceStagedInstallationPort> {
    requireStable(this.installRoot)
    const identity = MarketplacePackageArtifactIdentitySchema.parse(request.identity)
    const evidence = MarketplaceExtractedPackageEvidenceSchema.parse(request.evidence)
    const source = await stableSourceDirectory(request.sourceRoot)
    const key = storageKey(identity)
    if (await pathExists(path.join(this.installRoot.path, key))) {
      throw new Error('Marketplace installation storage already exists')
    }
    const partialPath = path.join(this.installRoot.path, `.partial-${key}-${randomUUID()}`)
    let partialIdentity: DirectoryIdentity | undefined
    try {
      await mkdir(partialPath, { mode: 0o700 })
      partialIdentity = await directoryIdentity(partialPath)
      for (const file of evidence.files) {
        await copyVerifiedFile(source, partialPath, file)
      }
      requireStable(source)
      requireStable(this.installRoot)
    } catch (error) {
      if (partialIdentity) await removeOwnedDirectory(this.installRoot, partialPath, partialIdentity)
      throw error
    }
    return createStagedPort(this.installRoot, partialPath, partialIdentity, key)
  }

  private async exists(identity: MarketplacePackageArtifactIdentity): Promise<boolean> {
    requireStable(this.installRoot)
    const target = path.join(this.installRoot.path, storageKey(identity))
    try {
      const stats = await lstat(target, { bigint: true })
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error('Marketplace installed storage is not a real directory')
      }
      return true
    } catch (error) {
      if (isCode(error, 'ENOENT')) return false
      throw error
    }
  }

  private async remove(identity: MarketplacePackageArtifactIdentity): Promise<void> {
    requireStable(this.installRoot)
    const key = storageKey(identity)
    const entries = await readdir(this.installRoot.path, { withFileTypes: true })
    const ownedNames = entries
      .map((entry) => entry.name)
      .filter((name) => name === key || name.startsWith(`.partial-${key}-`))
    for (const name of ownedNames) {
      const target = path.join(this.installRoot.path, name)
      const stats = await lstat(target, { bigint: true })
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error('Marketplace installation cleanup target is not an owned directory')
      }
      await removeOwnedDirectory(this.installRoot, target, { dev: stats.dev, ino: stats.ino })
    }
  }
}

async function createStagedPort(
  parent: StableDirectory,
  partialPath: string,
  identity: DirectoryIdentity,
  key: string,
): Promise<MarketplaceStagedInstallationPort> {
  let state: 'committed' | 'staged' | 'rolled-back' = 'staged'
  return Object.freeze({
    async commit() {
      if (state === 'committed') return
      if (state !== 'staged') throw new Error('Marketplace installation staging was rolled back')
      requireStable(parent)
      await requireDirectoryIdentity(partialPath, identity)
      const finalPath = path.join(parent.path, key)
      if (await pathExists(finalPath)) throw new Error('Marketplace installation destination already exists')
      await rename(partialPath, finalPath)
      state = 'committed'
    },
    async rollback() {
      if (state === 'rolled-back') return
      if (state === 'committed') throw new Error('Committed Marketplace installation requires storage removal')
      await removeOwnedDirectory(parent, partialPath, identity)
      state = 'rolled-back'
    },
    storageKey: key,
  })
}

async function copyVerifiedFile(
  source: StableDirectory,
  destinationRoot: string,
  expected: { readonly byteLength: number; readonly path: string; readonly sha256: string },
): Promise<void> {
  const segments = expected.path.split('/')
  await requireRealSourceAncestors(source.path, segments.slice(0, -1))
  await ensureDestinationDirectories(destinationRoot, segments.slice(0, -1))
  const sourcePath = path.join(source.path, ...segments)
  const destinationPath = path.join(destinationRoot, ...segments)
  const before = await lstat(sourcePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile() || before.size !== BigInt(expected.byteLength)) {
    throw new Error('Marketplace installation source must be the expected regular file')
  }
  const input = await open(sourcePath, 'r')
  const output = await open(destinationPath, 'wx', 0o600)
  try {
    const opened = await input.stat({ bigint: true })
    requireSameFile(before, opened)
    const digest = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let offset = 0
    while (true) {
      const { bytesRead } = await input.read(buffer, 0, buffer.byteLength, offset)
      if (bytesRead === 0) break
      offset += bytesRead
      if (offset > expected.byteLength) throw new Error('Marketplace installation source exceeded evidence')
      const bytes = buffer.subarray(0, bytesRead)
      digest.update(bytes)
      await writeAll(output, bytes)
    }
    if (offset !== expected.byteLength || digest.digest('hex') !== expected.sha256) {
      throw new Error('Marketplace installation source digest does not match extraction evidence')
    }
    await output.sync()
    requireSameFile(opened, await input.stat({ bigint: true }))
    requireSameFile(opened, await lstat(sourcePath, { bigint: true }))
  } finally {
    await Promise.allSettled([input.close(), output.close()])
  }
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    const result = await handle.write(bytes, offset, bytes.byteLength - offset)
    if (result.bytesWritten < 1) throw new Error('Marketplace installation write made no progress')
    offset += result.bytesWritten
  }
}

async function requireRealSourceAncestors(root: string, segments: readonly string[]): Promise<void> {
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    const stats = await lstat(current, { bigint: true })
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Marketplace installation source parent must be a real directory')
    }
  }
}

async function ensureDestinationDirectories(root: string, segments: readonly string[]): Promise<void> {
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    try { await mkdir(current, { mode: 0o700 }) } catch (error) {
      if (!isCode(error, 'EEXIST')) throw error
    }
    const stats = await lstat(current, { bigint: true })
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Marketplace installation destination parent is unsafe')
    }
  }
}

function storageKey(identity: MarketplacePackageArtifactIdentity): string {
  return createHash('sha256').update(JSON.stringify(
    MarketplacePackageArtifactIdentitySchema.parse(identity),
  )).digest('hex')
}

function stableDirectory(input: string): StableDirectory {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error('Marketplace installation root must be absolute')
  }
  const resolved = path.resolve(input)
  const stats = lstatSync(resolved, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Marketplace installation root must be a real directory')
  }
  return Object.freeze({ dev: stats.dev, ino: stats.ino, path: realpathSync.native(resolved) })
}

async function stableSourceDirectory(input: string): Promise<StableDirectory> {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error('Marketplace installation source root must be absolute')
  }
  const stats = await lstat(input, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Marketplace installation source root must be a real directory')
  }
  return Object.freeze({ dev: stats.dev, ino: stats.ino, path: realpathSync.native(input) })
}

function requireStable(directory: StableDirectory): void {
  const stats = lstatSync(directory.path, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()
    || stats.dev !== directory.dev || stats.ino !== directory.ino) {
    throw new Error('Marketplace installation directory identity changed')
  }
}

function requireSameFile(
  before: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; isFile(): boolean },
  after: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; isFile(): boolean },
): void {
  if (!before.isFile() || !after.isFile() || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
    throw new Error('Marketplace installation source changed while copying')
  }
}

async function directoryIdentity(input: string): Promise<DirectoryIdentity> {
  const stats = await lstat(input, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('Expected an owned directory')
  return Object.freeze({ dev: stats.dev, ino: stats.ino })
}

async function requireDirectoryIdentity(input: string, identity: DirectoryIdentity): Promise<void> {
  const stats = await lstat(input, { bigint: true })
  if (stats.isSymbolicLink() || !stats.isDirectory()
    || stats.dev !== identity.dev || stats.ino !== identity.ino) {
    throw new Error('Marketplace installation staging identity changed')
  }
}

async function removeOwnedDirectory(parent: StableDirectory, target: string, identity: DirectoryIdentity) {
  requireStable(parent)
  const relative = path.relative(parent.path, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
    throw new Error('Marketplace installation cleanup target is outside its owned root')
  }
  try { await requireDirectoryIdentity(target, identity) } catch (error) {
    if (isCode(error, 'ENOENT')) return
    throw error
  }
  await rm(target, { recursive: true })
}

async function pathExists(input: string): Promise<boolean> {
  try { await lstat(input); return true } catch (error) {
    if (isCode(error, 'ENOENT')) return false
    throw error
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
