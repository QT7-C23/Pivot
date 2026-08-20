import { describe, expect, it, vi } from 'vitest'
import { IpcRuntimeShutdownCoordinator } from '../../src/main/ipc-runtime-shutdown'

describe('IpcRuntimeShutdownCoordinator', () => {
  it('closes capabilities before session lifecycle and resources exactly once', async () => {
    const order: string[] = []
    const coordinator = new IpcRuntimeShutdownCoordinator({
      capabilities: { close: vi.fn(async () => { order.push('capabilities') }) },
      lifecycle: { shutdown: vi.fn(() => { order.push('lifecycle') }) },
      resources: [
        { close: vi.fn(() => { order.push('resource-a') }) },
        null,
        { close: vi.fn(() => { order.push('resource-b') }) }
      ],
      sessions: { list: vi.fn(() => [{ id: 'session-a' }, { id: 'session-b' }]) }
    })

    await coordinator.close()
    await coordinator.close()

    expect(order).toEqual(['capabilities', 'lifecycle', 'resource-a', 'resource-b'])
  })

  it('attempts every cleanup boundary when an earlier boundary fails', async () => {
    const lifecycle = vi.fn(() => { throw new Error('lifecycle failed') })
    const resource = { close: vi.fn() }
    const coordinator = new IpcRuntimeShutdownCoordinator({
      capabilities: { close: vi.fn(async () => { throw new Error('capability failed') }) },
      lifecycle: { shutdown: lifecycle },
      resources: [resource],
      sessions: { list: vi.fn(() => [{ id: 'session-a' }]) }
    })

    await expect(coordinator.close()).rejects.toThrow(AggregateError)
    expect(lifecycle).toHaveBeenCalledWith(['session-a'])
    expect(resource.close).toHaveBeenCalledOnce()
  })
})
