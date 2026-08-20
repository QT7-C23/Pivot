import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionRegistry } from '../../src/main/services/session-registry'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-session-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(tempRoot, { recursive: true, force: true })
})

describe('SessionRegistry', () => {
  it('creates and retrieves a session record', () => {
    const registry = new SessionRegistry(':memory:')

    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Pivot')

    expect(session.title).toBe('Pivot')
    expect(registry.get(session.id)).toEqual(session)
    expect(registry.list()).toHaveLength(1)

    registry.close()
  })

  it('persists sessions when the database is reopened', () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstRegistry = new SessionRegistry(databasePath)
    const session = firstRegistry.create('D:\\Project\\Tiny Agent Code', 'Pivot')
    firstRegistry.close()

    const secondRegistry = new SessionRegistry(databasePath)

    expect(secondRegistry.get(session.id)).toEqual(session)
    expect(secondRegistry.list().map((item) => item.id)).toEqual([session.id])

    secondRegistry.close()
  })

  it('opens an existing project session instead of creating a duplicate', () => {
    vi.useFakeTimers()
    const registry = new SessionRegistry(':memory:')

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const firstSession = registry.openProject('D:\\Project\\Tiny Agent Code', 'Pivot')
    vi.setSystemTime(new Date('2026-01-01T00:05:00.000Z'))
    const reopenedSession = registry.openProject('D:\\Project\\Tiny Agent Code')

    expect(reopenedSession.id).toBe(firstSession.id)
    expect(reopenedSession.updatedAt).toBe('2026-01-01T00:05:00.000Z')
    expect(registry.list()).toHaveLength(1)
    expect(registry.getLastProject()).toEqual({
      lastOpenedAt: '2026-01-01T00:05:00.000Z',
      path: 'D:\\Project\\Tiny Agent Code',
      title: 'Pivot',
    })

    registry.close()
  })

  it('deletes session records', () => {
    const registry = new SessionRegistry(':memory:')
    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Pivot')

    registry.delete(session.id)

    expect(registry.get(session.id)).toBeNull()
    expect(registry.list()).toHaveLength(0)

    registry.close()
  })

  it('persists pinned state through the session contract', () => {
    const registry = new SessionRegistry(':memory:')
    const session = registry.create('D:\\Project\\Pivot')

    expect(registry.setPinned(session.id, true).isPinned).toBe(true)
    expect(registry.get(session.id)?.isPinned).toBe(true)
    expect(registry.setPinned(session.id, false).isPinned).toBe(false)

    registry.close()
  })

  it('persists ordered chat messages with their session', () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstRegistry = new SessionRegistry(databasePath)
    const session = firstRegistry.create('D:\\Project\\Tiny Agent Code', 'Pivot')
    const userMessage = firstRegistry.addMessage(session.id, 'user', 'hello')
    const assistantMessage = firstRegistry.addMessage(session.id, 'assistant', 'hi there')
    firstRegistry.close()

    const secondRegistry = new SessionRegistry(databasePath)

    expect(secondRegistry.listMessages(session.id)).toEqual([userMessage, assistantMessage])

    secondRegistry.close()
  })

  it('deletes chat messages when a session is deleted', () => {
    const registry = new SessionRegistry(':memory:')
    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Pivot')
    registry.addMessage(session.id, 'user', 'hello')

    registry.delete(session.id)

    expect(registry.listMessages(session.id)).toEqual([])

    registry.close()
  })

  it('records project history when sessions are created', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const registry = new SessionRegistry(':memory:')

    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Pivot')

    expect(registry.getLastProject()).toEqual({
      lastOpenedAt: session.createdAt,
      path: session.projectPath,
      title: session.title,
    })
    expect(registry.listRecentProjects()).toEqual([
      {
        lastOpenedAt: session.createdAt,
        path: session.projectPath,
        title: session.title,
      },
    ])

    registry.close()
  })

  it('updates project history recency when a project is opened again', () => {
    vi.useFakeTimers()
    const registry = new SessionRegistry(':memory:')

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    registry.create('D:\\Project\\Alpha', 'Alpha')
    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'))
    registry.create('D:\\Project\\Beta', 'Beta')
    vi.setSystemTime(new Date('2026-01-01T00:02:00.000Z'))
    const reopened = registry.recordProjectOpen('D:\\Project\\Alpha', 'Alpha Prime')

    expect(registry.getLastProject()).toEqual(reopened)
    expect(registry.listRecentProjects()).toEqual([
      reopened,
      {
        lastOpenedAt: '2026-01-01T00:01:00.000Z',
        path: 'D:\\Project\\Beta',
        title: 'Beta',
      },
    ])

    registry.close()
  })

  it('persists project history when the database is reopened', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstRegistry = new SessionRegistry(databasePath)
    const session = firstRegistry.create('D:\\Project\\Tiny Agent Code', 'Pivot')
    firstRegistry.close()

    const secondRegistry = new SessionRegistry(databasePath)

    expect(secondRegistry.getLastProject()).toEqual({
      lastOpenedAt: session.createdAt,
      path: session.projectPath,
      title: session.title,
    })

    secondRegistry.close()
  })

  it('exports session as markdown and json', () => {
    const registry = new SessionRegistry(':memory:')
    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Pivot')
    registry.addMessage(session.id, 'user', 'hello')

    const markdown = registry.export(session.id, 'markdown', {
      adapterInfo: { id: 'cli', kind: 'cli', label: 'Codex CLI', profileId: 'codex' },
    })
    const json = JSON.parse(registry.export(session.id, 'json', {
      adapterInfo: { id: 'cli', kind: 'cli', label: 'Codex CLI', profileId: 'codex' },
    })) as unknown

    expect(markdown).toContain('# Pivot')
    expect(markdown).toContain('## Agent')
    expect(markdown).toContain('### user')
    expect(json).toMatchObject({
      adapter: { profileId: 'codex' },
      messages: [{ text: 'hello' }],
      session: {
        id: session.id,
        title: 'Pivot',
      },
    })

    registry.close()
  })

  it('supports searchable session organization, fork, and reversible deletion', () => {
    const registry = new SessionRegistry(':memory:')
    const group = registry.createGroup('Research')
    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Tiny Agent Code')
    registry.addMessage(session.id, 'user', 'Investigate renderer memory pressure')
    registry.addMessage(session.id, 'assistant', 'I will inspect the renderer lifecycle.')

    const organized = registry.updateMetadata(session.id, {
      groupId: group.id,
      isFavorite: true,
      isUnread: true,
      tags: ['performance', 'renderer'],
    })
    const fork = registry.fork(session.id)

    expect(organized).toMatchObject({
      groupId: group.id,
      isFavorite: true,
      isUnread: true,
      tags: ['performance', 'renderer'],
      title: 'Investigate renderer memory pressure',
    })
    expect(registry.search('memory pressure').map((item) => item.id)).toContain(session.id)
    expect(registry.listMessages(fork.id).map((message) => message.text)).toEqual([
      'Investigate renderer memory pressure',
      'I will inspect the renderer lifecycle.',
    ])

    registry.softDelete(session.id)
    expect(registry.list().some((item) => item.id === session.id)).toBe(false)
    expect(registry.undoDelete(session.id).deletedAt).toBeNull()
    expect(registry.list().some((item) => item.id === session.id)).toBe(true)

    registry.close()
  })

  it('treats soft deletion as a fork capability revocation until explicit undo', () => {
    const registry = new SessionRegistry(':memory:')
    const session = registry.create('D:\\Project\\Tiny Agent Code', 'Revoked')
    registry.addMessage(session.id, 'user', 'sensitive context')

    registry.softDelete(session.id)
    expect(registry.getActive(session.id)).toBeNull()
    expect(() => registry.fork(session.id)).toThrow(/active|deleted/i)

    registry.undoDelete(session.id)
    expect(registry.fork(session.id)).toMatchObject({ projectPath: session.projectPath })
    registry.close()
  })
})
