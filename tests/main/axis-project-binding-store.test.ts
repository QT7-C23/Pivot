import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteAxisProjectBindingStore } from '../../src/main/services/sqlite-axis-project-binding-store'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('SqliteAxisProjectBindingStore', () => {
  it('assigns one stable project identity across sessions for the same canonical root', async () => {
    const root = createProject()
    const store = new SqliteAxisProjectBindingStore(':memory:', {
      clock: () => new Date('2026-07-28T15:00:00.000Z'),
    })

    const first = await store.bind({ projectRoot: root, sessionId: 'session-1' })
    const second = await store.bind({
      projectRoot: path.join(root, 'src', '..'),
      sessionId: 'session-2',
    })

    expect(second.projectId).toBe(first.projectId)
    expect(second.projectRoot).toBe(first.projectRoot)
    expect(store.openReaderPort().findBySession('session-1')).toEqual(first)
    expect(store.openReaderPort().findBySession('session-2')).toEqual(second)
    expect(Object.keys(store.openReaderPort())).toEqual(['findBySession'])
    expect('bind' in store.openReaderPort()).toBe(false)
    expect('close' in store.openReaderPort()).toBe(false)
    store.close()
  })

  it('makes a session binding immutable and preserves the original record on rebind failure', async () => {
    const firstRoot = createProject()
    const otherRoot = createProject()
    const store = new SqliteAxisProjectBindingStore(':memory:')
    const original = await store.bind({ projectRoot: firstRoot, sessionId: 'session-1' })

    await expect(store.bind({
      projectRoot: otherRoot,
      sessionId: 'session-1',
    })).rejects.toThrow(/already bound|immutable/i)
    expect(store.openReaderPort().findBySession('session-1')).toEqual(original)
    store.close()
  })

  it('recovers project and session identity after reopening SQLite', async () => {
    const directory = createTempDirectory('pivot-project-binding-db-')
    const databasePath = path.join(directory, 'project-bindings.db')
    const root = createProject()
    const first = new SqliteAxisProjectBindingStore(databasePath, {
      clock: () => new Date('2026-07-28T15:00:00.000Z'),
    })
    const bound = await first.bind({ projectRoot: root, sessionId: 'session-1' })
    first.close()

    const reopened = new SqliteAxisProjectBindingStore(databasePath)
    expect(reopened.openReaderPort().findBySession('session-1')).toEqual(bound)
    const sameProject = await reopened.bind({ projectRoot: root, sessionId: 'session-2' })
    expect(sameProject.projectId).toBe(bound.projectId)
    reopened.close()
  })

  it('rejects missing, non-directory, relative, and malformed session bindings', async () => {
    const directory = createTempDirectory('pivot-project-binding-invalid-')
    const filePath = path.join(directory, 'file.txt')
    writeFileSync(filePath, 'not a project')
    const store = new SqliteAxisProjectBindingStore(':memory:')

    await expect(store.bind({
      projectRoot: path.join(directory, 'missing'),
      sessionId: 'session-1',
    })).rejects.toThrow()
    await expect(store.bind({
      projectRoot: filePath,
      sessionId: 'session-1',
    })).rejects.toThrow(/directory/i)
    await expect(store.bind({
      projectRoot: '.',
      sessionId: 'session-1',
    })).rejects.toThrow(/absolute/i)
    expect(() => store.openReaderPort().findBySession('')).toThrow()
    expect(store.openReaderPort().findBySession('session-1')).toBeNull()
    store.close()
  })
})

function createProject(): string {
  const root = createTempDirectory('pivot-project-binding-root-')
  mkdirSync(path.join(root, 'src'))
  return root
}

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
