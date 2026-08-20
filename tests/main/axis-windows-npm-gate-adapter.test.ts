import { describe, expect, it, vi } from 'vitest'
import { AxisWindowsNpmGateCommandAdapter } from '../../src/main/services/axis-windows-npm-gate-adapter'
import type { AxisGateCommandRunPort } from '../../src/main/services/axis-gate-runner'

describe('Axis Windows npm Gate command adapter', () => {
  it('uses cmd.exe only for the trusted npm.cmd Gate and preserves logical evidence', async () => {
    const runner: AxisGateCommandRunPort = {
      run: vi.fn(async (request) => ({
        ...request,
        exitCode: 0,
        finishedAt: '2026-07-29T00:00:01.000Z',
        outputTruncated: false,
        startedAt: '2026-07-29T00:00:00.000Z',
        stderr: '',
        stdout: 'passed',
        timedOut: false,
      })),
    }
    const adapter = new AxisWindowsNpmGateCommandAdapter({
      commandInterpreter: 'cmd.exe',
      platform: 'win32',
      runner,
    })

    const result = await adapter.run({
      args: ['exec', 'tsc', '--', '--noEmit'],
      command: 'npm.cmd',
      cwd: 'D:\\project',
      timeoutMs: 120_000,
    })

    expect(runner.run).toHaveBeenCalledWith({
      args: ['/d', '/s', '/c', 'npm.cmd exec tsc -- --noEmit'],
      command: 'cmd.exe',
      cwd: 'D:\\project',
      timeoutMs: 120_000,
    })
    expect(result).toMatchObject({
      args: ['exec', 'tsc', '--', '--noEmit'],
      command: 'npm.cmd',
      exitCode: 0,
    })
  })

  it('delegates without a shell on non-Windows platforms', async () => {
    const runner = successfulRunner()
    const adapter = new AxisWindowsNpmGateCommandAdapter({
      platform: 'linux',
      runner,
    })
    const request = {
      args: ['exec', 'tsc', '--', '--noEmit'],
      command: 'npm',
      cwd: '/project',
      timeoutMs: 120_000,
    }

    await expect(adapter.run(request)).resolves.toMatchObject({
      command: 'npm',
      exitCode: 0,
    })
    expect(runner.run).toHaveBeenCalledWith(request)
  })

  it('rejects shell metacharacters instead of widening the Gate command capability', async () => {
    const runner = successfulRunner()
    const adapter = new AxisWindowsNpmGateCommandAdapter({
      platform: 'win32',
      runner,
    })

    await expect(adapter.run({
      args: ['exec', 'tsc', '&', 'whoami'],
      command: 'npm.cmd',
      cwd: 'D:\\project',
      timeoutMs: 120_000,
    })).rejects.toThrow(/safe npm Gate token/i)
    expect(runner.run).not.toHaveBeenCalled()
  })
})

function successfulRunner() {
  return {
    run: vi.fn(async (request: {
      args: string[]
      command: string
      cwd: string
      timeoutMs: number
    }) => ({
      ...request,
      exitCode: 0,
      finishedAt: '2026-07-29T00:00:01.000Z',
      outputTruncated: false,
      startedAt: '2026-07-29T00:00:00.000Z',
      stderr: '',
      stdout: 'passed',
      timedOut: false,
    })),
  }
}
