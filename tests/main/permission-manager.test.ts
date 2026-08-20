import { afterEach, describe, expect, it, vi } from 'vitest'
import { PermissionManager } from '../../src/main/services/permission-manager'
import type { SignalMap } from '../../src/shared/signal-channel'

type SignalRecord = {
  payload: SignalMap[keyof SignalMap]
  signal: keyof SignalMap
}

describe('PermissionManager', () => {
  afterEach(() => vi.useRealTimers())
  it('emits a permission request and resolves the selected behavior', async () => {
    const permissions = new PermissionManager()
    const signals: SignalRecord[] = []
    const behaviorPromise = permissions.request(
      { input: { path: 'README.md' }, runId: 'run-1', sessionId: 'session-1', toolName: 'fs.write' },
      (signal, payload) => {
        signals.push({ payload, signal })
      },
    )
    const request = signals[0]?.payload

    expect(signals[0]?.signal).toBe('permission:request')
    expect(request).toMatchObject({ input: { path: 'README.md' }, toolName: 'fs.write' })

    permissions.resolve((request as { requestId: string }).requestId, 'allow')

    await expect(behaviorPromise).resolves.toBe('allow')
    expect(permissions.pendingCount).toBe(0)
  })

  it('rejects unknown permission request ids', () => {
    const permissions = new PermissionManager()

    expect(() => permissions.resolve('missing', 'deny')).toThrow('Unknown permission request')
  })

  it('reuses an allow rule only inside the same session and can clear it', async () => {
    const permissions = new PermissionManager()
    const signals: SignalRecord[] = []
    const first = permissions.request(
      { input: {}, runId: 'run-1', sessionId: 'session-1', toolName: 'fs.readText' },
      (signal, payload) => signals.push({ payload, signal }),
    )
    const requestId = (signals[0]?.payload as { requestId: string }).requestId
    permissions.resolve(requestId, 'allow_session')
    await expect(first).resolves.toBe('allow')

    await expect(permissions.request(
      { input: {}, runId: 'run-2', sessionId: 'session-1', toolName: 'fs.readText' },
      () => { throw new Error('should not prompt') },
    )).resolves.toBe('allow')

    permissions.clearSession('session-1')
    const afterClearSignals: SignalRecord[] = []
    void permissions.request(
      { input: {}, runId: 'run-3', sessionId: 'session-1', toolName: 'fs.readText' },
      (signal, payload) => afterClearSignals.push({ payload, signal }),
    )
    expect(afterClearSignals[0]?.signal).toBe('permission:request')
    permissions.resolve((afterClearSignals[0]?.payload as { requestId: string }).requestId, 'deny')
  })

  it('binds allow-session rules to the complete normalized tool input', async () => {
    const permissions = new PermissionManager()
    const signals: SignalRecord[] = []
    const first = permissions.request(
      {
        input: { args: ['test'], command: 'npm.cmd', cwd: 'D:\\Project\\Pivot' },
        runId: 'run-1',
        sessionId: 'session-1',
        toolName: 'term.run',
      },
      (signal, payload) => signals.push({ payload, signal }),
    )
    permissions.resolve((signals[0]?.payload as { requestId: string }).requestId, 'allow_session')
    await expect(first).resolves.toBe('allow')

    await expect(permissions.request(
      {
        input: { command: 'npm.cmd', cwd: 'D:\\Project\\Pivot', args: ['test'] },
        runId: 'run-2',
        sessionId: 'session-1',
        toolName: 'term.run',
      },
      () => { throw new Error('equivalent input should not prompt') },
    )).resolves.toBe('allow')

    const changedSignals: SignalRecord[] = []
    const changed = permissions.request(
      {
        input: { args: ['run', 'build'], command: 'npm.cmd', cwd: 'D:\\Project\\Pivot' },
        runId: 'run-3',
        sessionId: 'session-1',
        toolName: 'term.run',
      },
      (signal, payload) => changedSignals.push({ payload, signal }),
    )
    expect(changedSignals[0]?.signal).toBe('permission:request')
    permissions.resolve((changedSignals[0]?.payload as { requestId: string }).requestId, 'deny')
    await expect(changed).resolves.toBe('deny')
  })

  it('denies pending permission when the run is aborted', async () => {
    const permissions = new PermissionManager()
    const abortController = new AbortController()
    const behaviorPromise = permissions.request(
      { input: {}, runId: 'run-1', sessionId: 'session-1', toolName: 'shell.exec' },
      () => {},
      abortController.signal,
    )

    abortController.abort()

    await expect(behaviorPromise).resolves.toBe('deny')
    expect(permissions.pendingCount).toBe(0)
  })

  it('automatically denies a permission request after 120 seconds', async () => {
    vi.useFakeTimers()
    const permissions = new PermissionManager()
    const signals: SignalRecord[] = []
    const behaviorPromise = permissions.request(
      { input: {}, runId: 'run-1', sessionId: 'session-1', toolName: 'shell.exec' },
      (signal, payload) => signals.push({ payload, signal }),
    )
    const requestId = (signals[0]?.payload as { requestId: string }).requestId

    await vi.advanceTimersByTimeAsync(120_000)

    await expect(behaviorPromise).resolves.toBe('deny')
    expect(permissions.pendingCount).toBe(0)
    expect(signals).toContainEqual({
      payload: { behavior: 'deny', reason: 'timeout', requestId },
      signal: 'permission:resolved',
    })
  })
})
