import { describe, expect, it, vi } from 'vitest'
import { SessionCapabilityRevocationCoordinator } from '../../src/main/session-capability-revocation'

describe('SessionCapabilityRevocationCoordinator', () => {
  it('revokes only the requested session and awaits watcher disposal', async () => {
    const order: string[] = []
    const coordinator = new SessionCapabilityRevocationCoordinator({
      agents: {
        abort: vi.fn(() => order.push('agent-abort')),
        abortAll: vi.fn(),
        clearPermissionSession: vi.fn(() => order.push('permission-clear')),
      },
      terminals: {
        destroyAll: vi.fn(),
        destroyForOwner: vi.fn(),
        destroyForSession: vi.fn(() => order.push('terminal-destroy')),
      },
      watchers: {
        disposeAll: vi.fn(),
        disposeOwner: vi.fn(),
        disposeSession: vi.fn(async () => { order.push('watcher-close') }),
      },
    })

    await coordinator.revokeSession('session-1')

    expect(order).toEqual(['agent-abort', 'permission-clear', 'terminal-destroy', 'watcher-close'])
  })

  it('closes every runtime-owned capability before reporting shutdown complete', async () => {
    const abortAll = vi.fn()
    const destroyAll = vi.fn()
    let releaseWatchers: (() => void) | null = null
    const disposeAll = vi.fn(() => new Promise<void>((resolve) => { releaseWatchers = resolve }))
    const coordinator = new SessionCapabilityRevocationCoordinator({
      agents: { abort: vi.fn(), abortAll, clearPermissionSession: vi.fn() },
      terminals: { destroyAll, destroyForOwner: vi.fn(), destroyForSession: vi.fn() },
      watchers: { disposeAll, disposeOwner: vi.fn(), disposeSession: vi.fn() },
    })

    let closed = false
    const closing = coordinator.close().then(() => { closed = true })
    await Promise.resolve()

    expect(abortAll).toHaveBeenCalledOnce()
    expect(destroyAll).toHaveBeenCalledOnce()
    expect(disposeAll).toHaveBeenCalledOnce()
    expect(closed).toBe(false)
    expect(releaseWatchers).not.toBeNull()
    ;(releaseWatchers as unknown as () => void)()
    await closing
    expect(closed).toBe(true)
  })
})
