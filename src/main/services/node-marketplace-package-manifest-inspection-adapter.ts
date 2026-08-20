import { createHash } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import {
  MARKETPLACE_PACKAGE_MANIFEST_PATH,
  MAX_MARKETPLACE_PACKAGE_MANIFEST_BYTES,
} from '../../shared/marketplace-package-manifest-contracts'
import type {
  MarketplacePackageManifestInspection,
  MarketplacePackageManifestInspectionPort,
  MarketplacePackageManifestInspectionRequest,
} from './marketplace-package-manifest-ports'

export class NodeMarketplacePackageManifestInspectionAdapter {
  openInspectionPort(): MarketplacePackageManifestInspectionPort {
    return Object.freeze({
      inspect: (request: MarketplacePackageManifestInspectionRequest) => this.inspect(request),
    })
  }

  private async inspect(
    request: MarketplacePackageManifestInspectionRequest,
  ): Promise<MarketplacePackageManifestInspection> {
    if (!request || typeof request.rootPath !== 'string' || !path.isAbsolute(request.rootPath)) {
      throw new Error('Marketplace package manifest requires an absolute extracted root')
    }
    const root = await lstat(request.rootPath, { bigint: true })
    if (root.isSymbolicLink() || !root.isDirectory()) {
      throw new Error('Marketplace package manifest root must be a real directory')
    }
    const manifestPath = path.join(request.rootPath, MARKETPLACE_PACKAGE_MANIFEST_PATH)
    const before = await lstat(manifestPath, { bigint: true })
    if (before.isSymbolicLink() || !before.isFile()) {
      throw new Error('Marketplace package manifest must be a regular file')
    }
    if (before.size > BigInt(MAX_MARKETPLACE_PACKAGE_MANIFEST_BYTES)) {
      throw new Error('Marketplace package manifest exceeds its size limit')
    }
    const handle = await open(manifestPath, 'r')
    try {
      const opened = await handle.stat({ bigint: true })
      requireSameFile(before, opened)
      const bytes = await handle.readFile()
      if (bytes.byteLength > MAX_MARKETPLACE_PACKAGE_MANIFEST_BYTES) {
        throw new Error('Marketplace package manifest exceeds its size limit')
      }
      const after = await lstat(manifestPath, { bigint: true })
      requireSameFile(opened, after)
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      let value: unknown
      try {
        value = JSON.parse(text) as unknown
      } catch (error) {
        throw new Error('Marketplace package manifest is not valid JSON', { cause: error })
      }
      return Object.freeze({
        byteLength: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        value,
      })
    } finally {
      await handle.close()
    }
  }
}

function requireSameFile(
  before: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; isFile(): boolean },
  after: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; isFile(): boolean },
): void {
  if (!before.isFile() || !after.isFile() || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
    throw new Error('Marketplace package manifest changed or was replaced while reading')
  }
}
