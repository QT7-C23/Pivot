import { describe, expect, it, vi } from 'vitest'
import { SessionPermanentDeletionCoordinator } from '../../src/main/session-permanent-deletion'

describe('SessionPermanentDeletionCoordinator', () => {
  it('revokes capabilities before deleting owned data and commits the Session last', async () => {
    const order: string[] = []
    const coordinator = new SessionPermanentDeletionCoordinator({
      capabilities: { revokeSession: vi.fn(async () => { order.push('revoke') }) },
      lifecycle: {
        deleteSession: vi.fn((_id, commit) => {
          order.push('lifecycle')
          commit()
        }),
      },
      ownedData: [
        { deleteForSession: vi.fn(() => order.push('checkpoints')) },
        { deleteForSession: vi.fn(() => order.push('reviews')) },
      ],
      sessions: {
        delete: vi.fn(() => order.push('session')),
        get: vi.fn(() => ({ deletedAt: '2026-08-14T00:00:00.000Z' })),
      },
    })

    await coordinator.deleteSession('session-1')

    expect(order).toEqual(['revoke', 'lifecycle', 'checkpoints', 'reviews', 'session'])
  })

  it('keeps the Session record when owned-data cleanup fails and completes on retry', async () => {
    let shouldFail = true
    const sessionDelete = vi.fn()
    const firstStore = { deleteForSession: vi.fn() }
    const secondStore = {
      deleteForSession: vi.fn(() => {
        if (shouldFail) throw new Error('review database unavailable')
      }),
    }
    const coordinator = new SessionPermanentDeletionCoordinator({
      capabilities: { revokeSession: vi.fn(async () => undefined) },
      lifecycle: { deleteSession: vi.fn((_id, commit) => commit()) },
      ownedData: [firstStore, secondStore],
      sessions: {
        delete: sessionDelete,
        get: vi.fn(() => ({ deletedAt: '2026-08-14T00:00:00.000Z' })),
      },
    })

    await expect(coordinator.deleteSession('session-1')).rejects.toThrow('review database unavailable')
    expect(sessionDelete).not.toHaveBeenCalled()

    shouldFail = false
    await expect(coordinator.deleteSession('session-1')).resolves.toBeUndefined()
    expect(firstStore.deleteForSession).toHaveBeenCalledTimes(2)
    expect(sessionDelete).toHaveBeenCalledOnce()
  })

  it('rejects permanent deletion of an active Session before revoking capabilities', async () => {
    const revokeSession = vi.fn()
    const coordinator = new SessionPermanentDeletionCoordinator({
      capabilities: { revokeSession },
      lifecycle: { deleteSession: vi.fn() },
      ownedData: [],
      sessions: { delete: vi.fn(), get: vi.fn(() => ({ deletedAt: null })) },
    })

    await expect(coordinator.deleteSession('session-active')).rejects.toThrow(/soft-deleted/i)
    expect(revokeSession).not.toHaveBeenCalled()
  })
})
