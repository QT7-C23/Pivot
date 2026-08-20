import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileCheckpointStore } from '../../src/main/services/file-checkpoints'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-checkpoints-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(tempRoot, { recursive: true, force: true })
})

describe('FileCheckpointStore', () => {
  it('captures a file snapshot with content, size, and sha256', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'export const value = 42\n')
    const store = new FileCheckpointStore(':memory:')

    const checkpoint = await store.create('session-1', tempRoot, filePath)

    expect(checkpoint).toMatchObject({
      content: 'export const value = 42\n',
      createdAt: '2026-01-01T00:00:00.000Z',
      filePath,
      sessionId: 'session-1',
      sha256: createHash('sha256').update('export const value = 42\n', 'utf8').digest('hex'),
      sizeBytes: Buffer.byteLength('export const value = 42\n', 'utf8'),
    })
    expect(checkpoint.id).toMatch(/^checkpoint-/)
    expect(store.listForSession('session-1')).toEqual([checkpoint])

    store.close()
  })

  it('persists checkpoints when the database is reopened', async () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const filePath = path.join(tempRoot, 'README.md')
    await writeFile(filePath, '# Pivot')
    const firstStore = new FileCheckpointStore(databasePath)
    const checkpoint = await firstStore.create('session-1', tempRoot, filePath)
    firstStore.close()

    const secondStore = new FileCheckpointStore(databasePath)

    expect(secondStore.listForSession('session-1')).toEqual([checkpoint])

    secondStore.close()
  })

  it('lists checkpoints for a session newest first', async () => {
    vi.useFakeTimers()
    const firstFilePath = path.join(tempRoot, 'first.txt')
    const secondFilePath = path.join(tempRoot, 'second.txt')
    await writeFile(firstFilePath, 'first')
    await writeFile(secondFilePath, 'second')
    const store = new FileCheckpointStore(':memory:')

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const firstCheckpoint = await store.create('session-1', tempRoot, firstFilePath)
    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'))
    const secondCheckpoint = await store.create('session-1', tempRoot, secondFilePath)
    await store.create('session-2', tempRoot, secondFilePath)

    expect(store.listForSession('session-1').map((checkpoint) => checkpoint.id)).toEqual([
      secondCheckpoint.id,
      firstCheckpoint.id,
    ])

    store.close()
  })

  it('restores a checkpoint back to the original file path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const store = new FileCheckpointStore(':memory:')
    const checkpoint = await store.create('session-1', tempRoot, filePath)
    await writeFile(filePath, 'after')

    vi.setSystemTime(new Date('2026-01-01T00:02:00.000Z'))
    const result = await store.restore(checkpoint.id, tempRoot)

    await expect(readFile(filePath, 'utf8')).resolves.toBe('before')
    expect(result).toEqual({
      checkpointId: checkpoint.id,
      filePath,
      restoredAt: '2026-01-01T00:02:00.000Z',
      sha256: checkpoint.sha256,
      sizeBytes: checkpoint.sizeBytes,
    })

    store.close()
  })

  it('deletes every checkpoint owned by a deleted session', async () => {
    const filePath = path.join(tempRoot, 'source.ts')
    await writeFile(filePath, 'before')
    const store = new FileCheckpointStore(':memory:')
    await store.create('session-1', tempRoot, filePath)
    await store.create('session-2', tempRoot, filePath)

    expect(store.deleteForSession('session-1')).toBe(1)
    expect(store.listForSession('session-1')).toEqual([])
    expect(store.listForSession('session-2')).toHaveLength(1)

    store.close()
  })

  it('rejects restores for unknown checkpoints', async () => {
    const store = new FileCheckpointStore(':memory:')

    await expect(store.restore('checkpoint-missing', tempRoot)).rejects.toThrow('Checkpoint not found: checkpoint-missing')

    store.close()
  })

  it('rejects empty session ids', async () => {
    const filePath = path.join(tempRoot, 'note.txt')
    await writeFile(filePath, 'hello')
    const store = new FileCheckpointStore(':memory:')

    await expect(store.create('   ', tempRoot, filePath)).rejects.toThrow('Expected a session id')

    store.close()
  })

  it('rejects relative paths through the file-system boundary', async () => {
    const store = new FileCheckpointStore(':memory:')

    await expect(store.create('session-1', tempRoot, 'relative.txt')).rejects.toThrow('Expected an absolute path')

    store.close()
  })
})
