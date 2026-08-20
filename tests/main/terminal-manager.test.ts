import os from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { TerminalManager, type PtyFactory, type PtyProcess } from '../../src/main/services/terminal-manager'

class FakePty implements PtyProcess {
  dataListener: ((data: string) => void) | null = null
  exitListener: ((event: { exitCode: number; signal?: number }) => void) | null = null
  isKilled = false
  resizeCalls: Array<{ cols: number; rows: number }> = []
  writes: Array<string | Buffer> = []

  kill(): void {
    this.isKilled = true
  }

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListener = listener
    return { dispose: vi.fn() }
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
    this.exitListener = listener
    return { dispose: vi.fn() }
  }

  resize(cols: number, rows: number): void {
    this.resizeCalls.push({ cols, rows })
  }

  write(data: string | Buffer): void {
    this.writes.push(data)
  }

  emitData(data: string): void {
    this.dataListener?.(data)
  }

  emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, signal })
  }
}

function createHarness(): {
  factory: PtyFactory
  manager: TerminalManager
  pty: FakePty
  signals: Array<{ payload: unknown; signal: string }>
} {
  const pty = new FakePty()
  const factory: PtyFactory = {
    spawn: vi.fn(() => pty),
  }
  const signals: Array<{ payload: unknown; signal: string }> = []
  const manager = new TerminalManager({ ptyFactory: factory, shell: 'pivot-shell' })

  return { factory, manager, pty, signals }
}

describe('TerminalManager', () => {
  it('creates a pty and forwards data and exit signals', () => {
    const { factory, manager, pty, signals } = createHarness()
    const cwd = os.tmpdir()
    const id = manager.create({ cwd, ownerId: 7, sessionId: 'session-1' }, (signal, payload) => {
      signals.push({ payload, signal })
    })

    expect(factory.spawn).toHaveBeenCalledWith(
      'pivot-shell',
      [],
      expect.objectContaining({ cols: 100, cwd, name: 'xterm-color', rows: 30 }),
    )

    pty.emitData('ready')
    expect(signals).toContainEqual({ payload: { data: 'ready', id }, signal: 'term:data' })

    pty.emitExit(0)
    expect(signals).toContainEqual({ payload: { exitCode: 0, id, signal: undefined }, signal: 'term:exit' })
    expect(manager.size).toBe(0)
  })

  it('routes write resize and destroy by terminal id', () => {
    const { manager, pty } = createHarness()
    const id = manager.create({ cols: 120, cwd: os.tmpdir(), ownerId: 7, rows: 40, sessionId: 'session-1' }, () => {})

    manager.write({ data: 'npm test\r', id }, 7)
    manager.resize({ cols: 88, id, rows: 24 }, 7)
    manager.destroy(id, 7)

    expect(pty.writes).toEqual(['npm test\r'])
    expect(pty.resizeCalls).toEqual([{ cols: 88, rows: 24 }])
    expect(pty.isKilled).toBe(true)
    expect(manager.size).toBe(0)
  })

  it('rejects write resize and destroy from a renderer that does not own the terminal', () => {
    const { manager, pty } = createHarness()
    const id = manager.create({ cwd: os.tmpdir(), ownerId: 7, sessionId: 'session-1' }, () => {})

    expect(() => manager.write({ data: 'malicious\r', id }, 8)).toThrow('Terminal unavailable')
    expect(() => manager.resize({ cols: 200, id, rows: 60 }, 8)).toThrow('Terminal unavailable')
    expect(() => manager.destroy(id, 8)).toThrow('Terminal unavailable')

    expect(pty.writes).toEqual([])
    expect(pty.resizeCalls).toEqual([])
    expect(pty.isKilled).toBe(false)
    expect(manager.size).toBe(1)
  })

  it('destroys every pty owned by a closed renderer', () => {
    const first = createHarness()
    first.manager.create({ cwd: os.tmpdir(), ownerId: 7, sessionId: 'session-1' }, () => {})

    first.manager.destroyForOwner(7)

    expect(first.pty.isKilled).toBe(true)
    expect(first.manager.size).toBe(0)
  })

  it('destroys only terminals owned by a soft-deleted session', () => {
    const harness = createHarness()
    harness.manager.create({ cwd: os.tmpdir(), ownerId: 7, sessionId: 'session-1' }, () => {})
    harness.manager.create({ cwd: os.tmpdir(), ownerId: 7, sessionId: 'session-2' }, () => {})

    harness.manager.destroyForSession('session-1')

    expect(harness.manager.size).toBe(1)
  })
})
