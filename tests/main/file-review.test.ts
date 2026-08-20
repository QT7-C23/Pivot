import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileReviewStore } from '../../src/main/services/file-review'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-file-review-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true })
})

describe('FileReviewStore', () => {
  it('persists hunk decisions and rebuilds a mixed file without line drift', async () => {
    const filePath = path.join(tempRoot, 'source.ts')
    const original = 'const first = 1\nconst stable = 2\nconst last = 3\n'
    const proposed = 'const first = 10\nconst stable = 2\nconst last = 30\n'
    await writeFile(filePath, proposed)
    const store = new FileReviewStore(':memory:')
    const review = store.record({
      checkpointId: 'checkpoint-1',
      filePath,
      originalContent: original,
      proposedContent: proposed,
      sessionId: 'session-1',
    })

    expect(review.hunks).toHaveLength(2)
    await store.resolve(review.id, tempRoot, { decision: 'reject', hunkIndex: 0 })
    const resolved = await store.resolve(review.id, tempRoot, { decision: 'accept', hunkIndex: 1 })

    await expect(readFile(filePath, 'utf8')).resolves.toBe(
      'const first = 1\nconst stable = 2\nconst last = 30\n',
    )
    expect(resolved.status).toBe('mixed')
    expect(resolved.hunks.map((hunk) => hunk.decision)).toEqual(['rejected', 'accepted'])

    store.close()
  })
})
