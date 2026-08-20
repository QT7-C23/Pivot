import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextTimelineService } from '../../src/main/services/context-timeline'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'
import { FileReviewStore } from '../../src/main/services/file-review'
import { SafeFileWriter } from '../../src/main/services/safe-file-writer'
import { SessionRegistry } from '../../src/main/services/session-registry'

let tempRoot = ''
const openHarnesses: ReturnType<typeof createHarness>[] = []

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  for (const harness of openHarnesses.splice(0)) {
    harness.reviews.close()
    harness.checkpoints.close()
    harness.sessions.close()
  }
  await rm(tempRoot, { recursive: true, force: true })
})

function createHarness(): {
  checkpoints: FileCheckpointStore
  reviews: FileReviewStore
  safeWriter: SafeFileWriter
  sessions: SessionRegistry
  timeline: ContextTimelineService
} {
  const databasePath = path.join(tempRoot, 'pivot.sqlite')
  const sessions = new SessionRegistry(databasePath)
  const checkpoints = new FileCheckpointStore(databasePath)
  const reviews = new FileReviewStore(databasePath)
  const safeWriter = new SafeFileWriter({ checkpoints, reviews })
  const timeline = new ContextTimelineService({
    checkpoints,
    projectRootForSession: (sessionId) => sessions.get(sessionId)?.projectPath ?? null,
    reviews,
    sessions,
  })
  const harness = { checkpoints, reviews, safeWriter, sessions, timeline }
  openHarnesses.push(harness)
  return harness
}

describe('ContextTimelineService', () => {
  it('merges messages and file changes newest first with explicit entry contracts', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const session = harness.sessions.create(tempRoot, 'Timeline')
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before\n')

    vi.setSystemTime(new Date('2026-07-18T08:00:00.000Z'))
    const message = harness.sessions.addMessage(session.id, 'user', 'Update the source')
    vi.setSystemTime(new Date('2026-07-18T08:01:00.000Z'))
    const write = await harness.safeWriter.write(session.id, tempRoot, filePath, 'after\nplus\n')

    const entries = harness.timeline.list(session.id)

    expect(entries.map((entry) => entry.type)).toEqual(['file-change', 'message'])
    expect(entries[0]).toMatchObject({
      additions: 2,
      checkpointId: write.checkpoint?.id,
      deletions: 1,
      filePath: expect.stringMatching(/source\.ts$/),
      reviewId: write.reviewId,
      sessionId: session.id,
      type: 'file-change',
    })
    expect(entries[1]).toMatchObject({ id: message.id, role: 'user', text: 'Update the source', type: 'message' })

  })

  it('restores an existing file change and creates an undo checkpoint without rewinding conversation', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const session = harness.sessions.create(tempRoot, 'Restore')
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const write = await harness.safeWriter.write(session.id, tempRoot, filePath, 'after')
    vi.setSystemTime(new Date('2026-07-18T08:01:00.000Z'))
    harness.sessions.addMessage(session.id, 'user', 'Keep this conversation')

    vi.setSystemTime(new Date('2026-07-18T08:02:00.000Z'))
    const result = await harness.timeline.restoreChange(write.reviewId!)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('before')
    expect(result).toMatchObject({ action: 'restored', filePath: expect.stringMatching(/source\.ts$/), reviewId: write.reviewId })
    expect(result.undoCheckpointId).toMatch(/^checkpoint-/)
    expect(harness.sessions.listMessages(session.id).map((message) => message.role)).toEqual(['user', 'system'])
    expect(harness.sessions.listMessages(session.id)[0]?.text).toBe('Keep this conversation')

  })

  it('deletes a file that was created by the change and can restore it from the undo checkpoint', async () => {
    const harness = createHarness()
    const session = harness.sessions.create(tempRoot, 'Created file')
    const filePath = path.join(tempRoot, 'new-file.ts')
    const write = await harness.safeWriter.write(session.id, tempRoot, filePath, 'created')

    const result = await harness.timeline.restoreChange(write.reviewId!)

    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.action).toBe('deleted')
    await harness.checkpoints.restore(result.undoCheckpointId, tempRoot)
    await expect(readFile(filePath, 'utf8')).resolves.toBe('created')

  })
})
