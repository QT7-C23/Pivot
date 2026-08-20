import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionRecord } from '../../src/shared/types/domain'

const services = vi.hoisted(() => ({
  delete: vi.fn(),
  softDelete: vi.fn(),
  undoDelete: vi.fn(),
}))

vi.mock('../../src/renderer/services/session.service', () => ({ sessionService: services }))

import { useSessionStore } from '../../src/renderer/stores/session.store'

const session = {
  createdAt: '2026-07-16T00:00:00.000Z',
  deletedAt: null,
  groupId: null,
  id: 'session-1',
  isFavorite: false,
  isPinned: false,
  isUnread: false,
  projectPath: 'C:\\project',
  status: 'active',
  tags: [],
  title: 'Session one',
  updatedAt: '2026-07-16T00:00:00.000Z',
} satisfies SessionRecord

beforeEach(() => {
  vi.useFakeTimers()
  services.delete.mockReset().mockResolvedValue(undefined)
  services.softDelete.mockReset().mockResolvedValue({ ...session, deletedAt: '2026-07-16T00:01:00.000Z' })
  services.undoDelete.mockReset().mockResolvedValue(session)
  useSessionStore.setState({
    activeSessionId: session.id,
    error: null,
    groups: [],
    lastDeleted: null,
    sessions: [session],
  })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('session store deletion lifecycle', () => {
  it('keeps a soft-deleted session recoverable for five seconds', async () => {
    await useSessionStore.getState().softDeleteSession(session.id)

    expect(useSessionStore.getState().sessions).toEqual([])
    expect(useSessionStore.getState().lastDeleted?.id).toBe(session.id)
    expect(services.delete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)

    expect(services.delete).toHaveBeenCalledWith(session.id)
    expect(useSessionStore.getState().lastDeleted).toBeNull()
  })

  it('cancels hard deletion when undo is used', async () => {
    await useSessionStore.getState().softDeleteSession(session.id)
    await useSessionStore.getState().undoLastDelete()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(services.undoDelete).toHaveBeenCalledWith(session.id)
    expect(services.delete).not.toHaveBeenCalled()
    expect(useSessionStore.getState().sessions).toEqual([session])
    expect(useSessionStore.getState().lastDeleted).toBeNull()
  })
})
