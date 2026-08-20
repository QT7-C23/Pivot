/**
 * 信号通道单元测试
 *
 * 验证：
 * - 订阅/取消订阅正常工作
 * - cleanup 后 handler 不再被调用
 * - 多 handler 并发正确
 * - handlerCount 能检测泄漏
 */
import { describe, expect, it, vi } from 'vitest'
import { SignalChannel } from '../../src/shared/signal-channel'

describe('SignalChannel', () => {
  it('订阅后能收到事件', () => {
    const channel = new SignalChannel()
    const handler = vi.fn()

    channel.on('file:changed', handler)
    channel.emit('file:changed', { path: '/test.ts', action: 'modify', runId: 'run-1', sessionId: 'session-1' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ path: '/test.ts', action: 'modify', runId: 'run-1', sessionId: 'session-1' })

    channel.clear()
  })

  it('cleanup 后 handler 不再被调用', () => {
    const channel = new SignalChannel()
    const handler = vi.fn()

    const cleanup = channel.on('file:changed', handler)
    cleanup()

    channel.emit('file:changed', { path: '/test.ts', action: 'modify', runId: 'run-1', sessionId: 'session-1' })
    expect(handler).not.toHaveBeenCalled()

    channel.clear()
  })

  it('多个 handler 各自独立', () => {
    const channel = new SignalChannel()
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const cleanup1 = channel.on('file:changed', handler1)
    channel.on('file:changed', handler2)

    channel.emit('file:changed', { path: '/a.ts', action: 'add', runId: 'run-1', sessionId: 'session-1' })
    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)

    cleanup1()
    channel.emit('file:changed', { path: '/b.ts', action: 'add', runId: 'run-1', sessionId: 'session-1' })
    expect(handler1).toHaveBeenCalledTimes(1) // 不再增加
    expect(handler2).toHaveBeenCalledTimes(2) // 继续增加

    channel.clear()
  })

  it('不同事件类型互不干扰', () => {
    const channel = new SignalChannel()
    const fileHandler = vi.fn()
    const agentHandler = vi.fn()

    channel.on('file:changed', fileHandler)
    channel.on('agent:state', agentHandler)

    channel.emit('file:changed', { path: '/test.ts', action: 'modify', runId: 'run-1', sessionId: 'session-1' })
    expect(fileHandler).toHaveBeenCalledTimes(1)
    expect(agentHandler).not.toHaveBeenCalled()

    channel.emit('agent:state', { runId: 'run-1', sessionId: 'session-1', state: 'thinking' })
    expect(agentHandler).toHaveBeenCalledTimes(1)

    channel.clear()
  })

  it('handlerCount 正确反映活跃订阅数', () => {
    const channel = new SignalChannel()

    expect(channel.handlerCount).toBe(0)

    const cleanup1 = channel.on('file:changed', () => {})
    expect(channel.handlerCount).toBe(1)

    channel.on('file:changed', () => {})
    expect(channel.handlerCount).toBe(2)

    channel.on('agent:state', () => {})
    expect(channel.handlerCount).toBe(3)

    cleanup1()
    expect(channel.handlerCount).toBe(2)

    channel.clear()
    expect(channel.handlerCount).toBe(0)
  })
})
