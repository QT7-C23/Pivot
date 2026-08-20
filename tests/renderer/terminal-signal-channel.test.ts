import { describe, expect, it, vi } from 'vitest'
import { SignalChannel } from '../../src/shared/signal-channel'

describe('terminal signal channel', () => {
  it('delivers terminal data through a one-way renderer signal', () => {
    const channel = new SignalChannel()
    const handler = vi.fn()

    channel.on('term:data', handler)
    channel.emit('term:data', { data: 'hello\r\n', id: 'term-1' })

    expect(handler).toHaveBeenCalledWith({ data: 'hello\r\n', id: 'term-1' })
  })

  it('delivers terminal exit state through a one-way renderer signal', () => {
    const channel = new SignalChannel()
    const handler = vi.fn()

    channel.on('term:exit', handler)
    channel.emit('term:exit', { exitCode: 0, id: 'term-1' })

    expect(handler).toHaveBeenCalledWith({ exitCode: 0, id: 'term-1' })
  })
})
