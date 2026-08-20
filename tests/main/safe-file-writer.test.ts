import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { FileReviewStore } from '../../src/main/services/file-review'
import { SafeFileWriter } from '../../src/main/services/safe-file-writer'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-safe-write-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(tempRoot, { recursive: true, force: true })
})

describe('SafeFileWriter', () => {
  it('checkpoints an existing file before writing new content', async () => {
    vi.useFakeTimers()
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const checkpoints = new FileCheckpointStore(':memory:')
    const writer = new SafeFileWriter({ checkpoints })

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const result = await writer.write('session-1', tempRoot, filePath, 'after')
    const canonicalFilePath = await realpath(filePath)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('after')
    expect(result).toMatchObject({
      checkpoint: {
        content: 'before',
        filePath: canonicalFilePath,
        sessionId: 'session-1',
        sha256: createHash('sha256').update('before', 'utf8').digest('hex'),
      },
      filePath: canonicalFilePath,
      sha256: createHash('sha256').update('after', 'utf8').digest('hex'),
      sizeBytes: Buffer.byteLength('after', 'utf8'),
      writtenAt: '2026-01-01T00:00:00.000Z',
    })
    expect(checkpoints.listForSession('session-1')).toEqual([result.checkpoint])

    checkpoints.close()
  })

  it('writes a new file without creating a checkpoint', async () => {
    const filePath = path.join(tempRoot, 'new-file.ts')
    const checkpoints = new FileCheckpointStore(':memory:')
    const writer = new SafeFileWriter({ checkpoints })

    const result = await writer.write('session-1', tempRoot, filePath, 'created')

    await expect(readFile(filePath, 'utf8')).resolves.toBe('created')
    expect(result.checkpoint).toBeNull()
    expect(checkpoints.listForSession('session-1')).toEqual([])

    checkpoints.close()
  })

  it('registers an existing-file write as a pending review', async () => {
    const filePath = path.join(tempRoot, 'review.ts')
    await writeFile(filePath, 'before')
    const checkpoints = new FileCheckpointStore(':memory:')
    const reviews = new FileReviewStore(':memory:')
    const writer = new SafeFileWriter({ checkpoints, reviews })

    const result = await writer.write('session-1', tempRoot, filePath, 'after')

    expect(result.reviewId).toMatch(/^review-/)
    expect(reviews.listForSession('session-1')).toEqual([
      expect.objectContaining({
        filePath: result.filePath,
        modifiedContent: 'after',
        originalContent: 'before',
        status: 'pending',
      }),
    ])

    reviews.close()
    checkpoints.close()
  })

  it('rejects empty session ids', async () => {
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const checkpoints = new FileCheckpointStore(':memory:')
    const writer = new SafeFileWriter({ checkpoints })

    await expect(writer.write('   ', tempRoot, filePath, 'after')).rejects.toThrow('Expected a session id')

    checkpoints.close()
  })

  it('rejects relative paths through the file-system boundary', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const writer = new SafeFileWriter({ checkpoints })

    await expect(writer.write('session-1', tempRoot, 'relative.txt', 'after')).rejects.toThrow('Expected an absolute path')

    checkpoints.close()
  })

  it('rejects directory paths', async () => {
    const checkpoints = new FileCheckpointStore(':memory:')
    const writer = new SafeFileWriter({ checkpoints })

    await expect(writer.write('session-1', tempRoot, tempRoot, 'after')).rejects.toThrow('Safe writes only support files')

    checkpoints.close()
  })
})
