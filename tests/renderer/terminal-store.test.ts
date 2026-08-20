import { beforeEach, describe, expect, it } from 'vitest'
import { useTerminalStore } from '../../src/renderer/stores/terminal.store'

beforeEach(() => {
  useTerminalStore.setState({
    activeTerminalId: 'term-2',
    error: null,
    instances: [
      { cwd: 'C:\\project', id: 'term-1', isActive: false, output: '', sessionId: 'session-1', status: 'running' },
      { cwd: 'C:\\project', id: 'term-2', isActive: true, output: '', sessionId: 'session-1', status: 'running' },
    ],
  })
})

describe('terminal store', () => {
  it('moves focus to a running terminal when the active process exits', () => {
    useTerminalStore.getState().markExited('term-2', 0)

    expect(useTerminalStore.getState()).toMatchObject({
      activeTerminalId: 'term-1',
      instances: [
        expect.objectContaining({ id: 'term-1', isActive: true, status: 'running' }),
        expect.objectContaining({ exitCode: 0, id: 'term-2', isActive: false, status: 'exited' }),
      ],
    })
  })
})
