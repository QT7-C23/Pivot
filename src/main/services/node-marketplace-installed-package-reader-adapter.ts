import { createHash } from 'node:crypto'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { MarketplacePackageArtifactIdentitySchema, type MarketplacePackageArtifactIdentity } from '../../shared/marketplace-contracts'
import {
  MARKETPLACE_PACKAGE_MANIFEST_PATH,
  MAX_MARKETPLACE_PACKAGE_MANIFEST_BYTES,
  MarketplacePackageManifestSchema,
} from '../../shared/marketplace-package-manifest-contracts'
import { MarketplaceDataResourceSchema } from '../../shared/marketplace-resource-contracts'
import type { MarketplaceInstalledPackageReaderPort } from './marketplace-activation-ports'
import type { MarketplaceInstallationRegistryReaderPort } from './marketplace-installation-ports'
import type { MarketplaceInstalledResource } from './marketplace-resource-consumer-ports'

const MAX_RESOURCE_BYTES = 4 * 1024 * 1024

export class NodeMarketplaceInstalledPackageReaderAdapter {
  private readonly installRoot: string
  private readonly installations: MarketplaceInstallationRegistryReaderPort

  constructor(options: { readonly installations: MarketplaceInstallationRegistryReaderPort; readonly installRoot: string }) {
    if (!path.isAbsolute(options.installRoot)) throw new Error('Marketplace installed package root must be absolute')
    this.installRoot = path.resolve(options.installRoot)
    this.installations = options.installations
  }

  openReaderPort(): MarketplaceInstalledPackageReaderPort {
    return Object.freeze({
      readManifest: (identity: MarketplacePackageArtifactIdentity) => this.readManifest(identity),
      readResource: (identity: MarketplacePackageArtifactIdentity) => this.readResource(identity),
    })
  }

  private async readManifest(identityInput: MarketplacePackageArtifactIdentity) {
    const { packageRoot, record } = await this.packageRoot(identityInput)
    if (!record.manifestEvidence) throw new Error('Marketplace installation lacks immutable manifest evidence and must be reinstalled')
    const read = await readStableFile(packageRoot, MARKETPLACE_PACKAGE_MANIFEST_PATH, MAX_MARKETPLACE_PACKAGE_MANIFEST_BYTES)
    if (read.bytes.byteLength !== record.manifestEvidence.byteLength || read.sha256 !== record.manifestEvidence.sha256) {
      throw new Error('Marketplace installed manifest does not match installation evidence')
    }
    const manifest = parseJson(read.bytes, 'Marketplace installed manifest')
    const validated = MarketplacePackageManifestSchema.parse(manifest)
    if (JSON.stringify(validated.identity) !== JSON.stringify(record.identity)
      || JSON.stringify(validated.capabilities) !== JSON.stringify(record.capabilities)) {
      throw new Error('Marketplace installed manifest authority does not match installation evidence')
    }
    return validated
  }

  private async readResource(identityInput: MarketplacePackageArtifactIdentity): Promise<MarketplaceInstalledResource> {
    const identity = MarketplacePackageArtifactIdentitySchema.parse(identityInput)
    const manifest = await this.readManifest(identity)
    const { packageRoot } = await this.packageRoot(identity)
    const evidence = manifest.files.find((file) => file.path === manifest.entrypoint)
    if (!evidence) throw new Error('Marketplace entrypoint lacks file evidence')
    const read = await readStableFile(packageRoot, manifest.entrypoint, Math.min(MAX_RESOURCE_BYTES, evidence.byteLength))
    if (read.bytes.byteLength !== evidence.byteLength || read.sha256 !== evidence.sha256) {
      throw new Error('Marketplace installed entrypoint does not match package evidence')
    }
    if (identity.kind === 'plugin') {
      if (!manifest.entrypoint.toLocaleLowerCase('en-US').endsWith('.wasm')) {
        throw new Error('Marketplace plugin entrypoint must use the .wasm format')
      }
      return Object.freeze({ bytes: Uint8Array.from(read.bytes), kind: 'plugin' as const })
    }
    if (!manifest.entrypoint.toLocaleLowerCase('en-US').endsWith('.json')) {
      throw new Error('Marketplace data resource entrypoint must use the .json format')
    }
    const resource = MarketplaceDataResourceSchema.parse(parseJson(read.bytes, 'Marketplace installed resource'))
    if (resource.kind !== identity.kind || resource.id !== identity.resourceId) {
      throw new Error('Marketplace installed resource identity does not match package identity')
    }
    return resource
  }

  private async packageRoot(identityInput: MarketplacePackageArtifactIdentity) {
    const identity = MarketplacePackageArtifactIdentitySchema.parse(identityInput)
    const record = this.installations.get(identity)
    if (!record || record.state !== 'installed') throw new Error('Marketplace package is not installed')
    const rootStats = await lstat(this.installRoot)
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error('Marketplace install root is not a real directory')
    const packageRoot = path.join(this.installRoot, record.storageKey)
    const packageStats = await lstat(packageRoot)
    if (packageStats.isSymbolicLink() || !packageStats.isDirectory()) throw new Error('Marketplace installed package root is not a real directory')
    const realInstallRoot = await realpath(this.installRoot)
    const realPackageRoot = await realpath(packageRoot)
    const relative = path.relative(realInstallRoot, realPackageRoot)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Marketplace installed package escaped its owned root')
    }
    return { packageRoot: realPackageRoot, record }
  }
}

async function readStableFile(root: string, portablePath: string, maxBytes: number) {
  const segments = portablePath.split('/')
  let parent = root
  for (const segment of segments.slice(0, -1)) {
    parent = path.join(parent, segment)
    const stats = await lstat(parent)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('Marketplace installed file parent is not a real directory')
  }
  const filePath = path.join(root, ...segments)
  const before = await lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile() || before.size > BigInt(maxBytes)) {
    throw new Error('Marketplace installed resource is not a bounded regular file')
  }
  const handle = await open(filePath, 'r')
  try {
    const opened = await handle.stat({ bigint: true })
    requireSameFile(before, opened)
    const bytes = await handle.readFile()
    const after = await lstat(filePath, { bigint: true })
    requireSameFile(opened, after)
    return Object.freeze({ bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
  } finally {
    await handle.close()
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
  catch (error) { throw new Error(`${label} is not valid UTF-8 JSON`, { cause: error }) }
}

function requireSameFile(
  before: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; isFile(): boolean },
  after: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; isFile(): boolean },
): void {
  if (!before.isFile() || !after.isFile() || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
    throw new Error('Marketplace installed file changed or was replaced while reading')
  }
}
