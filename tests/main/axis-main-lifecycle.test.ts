import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxisMainLifecycleCoordinator } from '../../src/main/services/axis-main-lifecycle'
import { SqliteAxisProjectBindingStore } from '../../src/main/services/sqlite-axis-project-binding-store'

const tempDirectories: string[] = []

afterEach(async () => {
  for (const directory of tempDirectories.splice(0)) {
    await rm(directory, { force: true, recursive: true })
  }
})

describe('AxisMainLifecycleCoordinator', () => {
  it('binds existing, created, opened, and forked sessions through the Admin Port', async () => {
    const bind = vi.fn(async ({ projectRoot, sessionId }) => ({
      boundAt: '2026-07-28T16:00:00.000Z',
      projectId: `project-${sessionId}`,
      projectRoot,
      schemaVersion: 1 as const,
      sessionId,
    }))
    const lifecycle = new AxisMainLifecycleCoordinator({
      bindings: { bind, unbindSession: vi.fn() },
      leases: { cleanup: vi.fn() },
    })

    await lifecycle.initialize([
      { id: 'session-existing', projectPath: 'D:\\existing' },
    ])
    const created = await lifecycle.bindSession({
      id: 'session-created',
      projectPath: 'D:\\created',
      title: 'Created',
    })
    const opened = await lifecycle.bindSession({
      id: 'session-opened',
      projectPath: 'D:\\opened',
      title: 'Opened',
    })
    const forked = await lifecycle.bindSession({
      id: 'session-forked',
      projectPath: 'D:\\forked',
      title: 'Forked',
    })

    expect(created.title).toBe('Created')
    expect(opened.title).toBe('Opened')
    expect(forked.title).toBe('Forked')
    expect(bind.mock.calls.map(([request]) => request)).toEqual([
      { projectRoot: 'D:\\existing', sessionId: 'session-existing' },
      { projectRoot: 'D:\\created', sessionId: 'session-created' },
      { projectRoot: 'D:\\opened', sessionId: 'session-opened' },
      { projectRoot: 'D:\\forked', sessionId: 'session-forked' },
    ])
  })

  it('cleans leases and unbinds before the deletion commits', () => {
    const order: string[] = []
    const lifecycle = new AxisMainLifecycleCoordinator({
      bindings: {
        bind: vi.fn(),
        unbindSession: vi.fn(() => {
          order.push('unbind')
          return true
        }),
      },
      leases: {
        cleanup: vi.fn(() => {
          order.push('cleanup')
          return receipt('session-deleted')
        }),
      },
    })

    lifecycle.deleteSession('session-1', () => order.push('delete'))

    expect(order).toEqual(['cleanup', 'unbind', 'delete'])
  })

  it('does not commit deletion when project unbinding fails', () => {
    const commitDeletion = vi.fn()
    const lifecycle = new AxisMainLifecycleCoordinator({
      bindings: {
        bind: vi.fn(),
        unbindSession: vi.fn(() => { throw new Error('binding database unavailable') }),
      },
      leases: { cleanup: vi.fn(() => receipt('session-deleted')) },
    })

    expect(() => lifecycle.deleteSession('session-1', commitDeletion))
      .toThrow('binding database unavailable')
    expect(commitDeletion).not.toHaveBeenCalled()
  })

  it('cleans a soft-closed session before committing the close and revoking its binding', () => {
    const order: string[] = []
    const unbindSession = vi.fn(() => { order.push('unbind'); return true })
    const lifecycle = new AxisMainLifecycleCoordinator({
      bindings: { bind: vi.fn(), unbindSession },
      leases: {
        cleanup: vi.fn(() => {
          order.push('cleanup')
          return {
            ...receipt('session-deleted'),
            reason: 'session-closed' as const,
          }
        }),
      },
    })

    expect(lifecycle.closeSession('session-1', () => {
      order.push('close')
      return 'closed'
    })).toBe('closed')
    expect(order).toEqual(['cleanup', 'unbind', 'close'])
    expect(unbindSession).toHaveBeenCalledWith('session-1')
  })

  it('does not delete or unbind when lease cleanup fails', () => {
    const deleteSession = vi.fn()
    const unbindSession = vi.fn()
    const lifecycle = new AxisMainLifecycleCoordinator({
      bindings: { bind: vi.fn(), unbindSession },
      leases: {
        cleanup: vi.fn(() => {
          throw new Error('lease database unavailable')
        }),
      },
    })

    expect(() => lifecycle.deleteSession('session-1', deleteSession))
      .toThrow('lease database unavailable')
    expect(deleteSession).not.toHaveBeenCalled()
    expect(unbindSession).not.toHaveBeenCalled()
  })

  it('rebinds an existing session after restart without changing project identity', async () => {
    const projectRoot = await temporaryDirectory('pivot-main-lifecycle-project-')
    const databaseRoot = await temporaryDirectory('pivot-main-lifecycle-db-')
    const databasePath = path.join(databaseRoot, 'pivot.sqlite')
    await mkdir(path.join(projectRoot, 'src'))
    const session = { id: 'session-1', projectPath: projectRoot }

    const firstStore = new SqliteAxisProjectBindingStore(databasePath)
    const first = new AxisMainLifecycleCoordinator({
      bindings: firstStore,
      leases: { cleanup: vi.fn() },
    })
    await first.initialize([session])
    const firstProjectId = firstStore.openReaderPort().findBySession(session.id)?.projectId
    firstStore.close()

    const secondStore = new SqliteAxisProjectBindingStore(databasePath)
    const second = new AxisMainLifecycleCoordinator({
      bindings: secondStore,
      leases: { cleanup: vi.fn() },
    })
    await second.initialize([session])
    expect(secondStore.openReaderPort().findBySession(session.id)?.projectId)
      .toBe(firstProjectId)
    secondStore.close()
  })

  it('cleans every live session on shutdown and propagates cleanup interruption', () => {
    const cleanup = vi.fn()
      .mockReturnValueOnce(receipt('shutdown', 'session-1'))
      .mockImplementationOnce(() => {
        throw new Error('shutdown cleanup interrupted')
      })
    const lifecycle = new AxisMainLifecycleCoordinator({
      bindings: { bind: vi.fn(), unbindSession: vi.fn() },
      leases: { cleanup },
    })

    expect(() => lifecycle.shutdown(['session-1', 'session-2']))
      .toThrow('shutdown cleanup interrupted')
    expect(cleanup.mock.calls.map(([request]) => request)).toEqual([
      { reason: 'shutdown', scope: 'session', sessionId: 'session-1' },
      { reason: 'shutdown', scope: 'session', sessionId: 'session-2' },
    ])
  })
})

function receipt(
  reason: 'session-deleted' | 'shutdown',
  sessionId = 'session-1',
) {
  return {
    cleanedAt: '2026-07-28T16:00:00.000Z',
    reason,
    releasedLeaseCount: 0,
    runId: null,
    schemaVersion: 1 as const,
    scope: 'session' as const,
    sessionId,
  }
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
