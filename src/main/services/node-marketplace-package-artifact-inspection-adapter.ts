import { createHash } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import type {
  MarketplacePackageArtifactInspection,
  MarketplacePackageArtifactInspectionPort,
  MarketplacePackageArtifactInspectionRequest,
} from './marketplace-package-artifact-ports'

const READ_BUFFER_BYTES = 64 * 1024

export class NodeMarketplacePackageArtifactInspectionAdapter {
  openInspectionPort(): MarketplacePackageArtifactInspectionPort {
    return Object.freeze({
      inspect: (request: MarketplacePackageArtifactInspectionRequest) => this.inspect(request),
    })
  }

  private async inspect(
    request: MarketplacePackageArtifactInspectionRequest,
  ): Promise<MarketplacePackageArtifactInspection> {
    validateRequest(request)
    const pathBefore = await lstat(request.artifactPath, { bigint: true })
    if (pathBefore.isSymbolicLink()) {
      throw new Error('Marketplace package artifact cannot be a symbolic link')
    }
    if (!pathBefore.isFile()) {
      throw new Error('Marketplace package artifact must be a regular file')
    }

    const handle = await open(request.artifactPath, 'r')
    try {
      const handleBefore = await handle.stat({ bigint: true })
      assertStableRegularFile(pathBefore, handleBefore)
      assertWithinLimit(handleBefore.size, request.maxByteLength)

      const hash = createHash('sha256')
      const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
      let position = 0
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, position)
        if (bytesRead === 0) break
        position += bytesRead
        if (position > request.maxByteLength) {
          throw new Error('Marketplace package artifact exceeds the configured maximum byte limit')
        }
        hash.update(buffer.subarray(0, bytesRead))
      }

      const handleAfter = await handle.stat({ bigint: true })
      assertStableRegularFile(handleBefore, handleAfter)
      const pathAfter = await lstat(request.artifactPath, { bigint: true })
      if (pathAfter.isSymbolicLink()) {
        throw new Error('Marketplace package artifact became a symbolic link during inspection')
      }
      assertStableRegularFile(handleAfter, pathAfter)
      if (BigInt(position) !== handleAfter.size) {
        throw new Error('Marketplace package artifact changed while it was being inspected')
      }

      return Object.freeze({
        byteLength: position,
        sha256: hash.digest('hex'),
      })
    } finally {
      await handle.close()
    }
  }
}

function validateRequest(request: MarketplacePackageArtifactInspectionRequest): void {
  if (typeof request.artifactPath !== 'string'
    || request.artifactPath.length < 1
    || request.artifactPath.length > 32_767
    || !path.isAbsolute(request.artifactPath)) {
    throw new Error('Marketplace package artifact path must be an absolute Main-process path')
  }
  if (!Number.isSafeInteger(request.maxByteLength) || request.maxByteLength < 1) {
    throw new Error('Marketplace package artifact maximum byte limit is invalid')
  }
}

function assertWithinLimit(size: bigint, maxByteLength: number): void {
  if (size > BigInt(maxByteLength)) {
    throw new Error('Marketplace package artifact exceeds the configured maximum byte limit')
  }
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Marketplace package artifact byte length cannot be represented safely')
  }
}

function assertStableRegularFile(before: BigIntStats, after: BigIntStats): void {
  if (!before.isFile() || !after.isFile()) {
    throw new Error('Marketplace package artifact must remain a regular file')
  }
  if (before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || before.mtimeNs !== after.mtimeNs
    || before.ctimeNs !== after.ctimeNs) {
    throw new Error('Marketplace package artifact changed or was replaced during inspection')
  }
}
