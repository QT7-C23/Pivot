import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import type { FileSafeWriteResult } from '../../shared/types/domain'
import { resolvePathWithinRoot, writeTextFile } from './file-system'
import type { FileCheckpointStore } from './file-checkpoints'
import type { FileReviewStore } from './file-review'

export class SafeFileWriter {
  private readonly checkpoints: FileCheckpointStore
  private readonly reviews?: FileReviewStore

  constructor(options: { checkpoints: FileCheckpointStore; reviews?: FileReviewStore }) {
    this.checkpoints = options.checkpoints
    this.reviews = options.reviews
  }

  async write(sessionId: string, projectRoot: string, filePath: string, content: string): Promise<FileSafeWriteResult> {
    const trimmedSessionId = sessionId.trim()
    if (!trimmedSessionId) {
      throw new Error('Expected a session id')
    }

    const resolvedFilePath = await resolvePathWithinRoot(projectRoot, filePath, { allowMissingLeaf: true })
    const checkpoint = await this.fileExists(resolvedFilePath)
      ? await this.checkpoints.create(trimmedSessionId, projectRoot, resolvedFilePath)
      : null

    await writeTextFile(projectRoot, resolvedFilePath, content)
    const review = this.reviews && (checkpoint?.content ?? '') !== content
      ? this.reviews.record({
          checkpointId: checkpoint?.id ?? null,
          filePath: resolvedFilePath,
          originalContent: checkpoint?.content ?? '',
          proposedContent: content,
          sessionId: trimmedSessionId,
        })
      : null

    return {
      checkpoint,
      filePath: resolvedFilePath,
      reviewId: review?.id,
      sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      writtenAt: new Date().toISOString(),
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) {
        throw new Error('Safe writes only support files')
      }
      return true
    } catch (error) {
      if (isNotFoundError(error)) {
        return false
      }
      throw error
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
