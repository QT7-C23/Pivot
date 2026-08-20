import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRunner } from '../../src/main/services/command-runner'

class FakeChildProcess extends EventEmitter {
  killed = false
  stderr = new PassThrough()
  stdout = new PassThrough()

  kill(): void {
    this.killed = true
    this.emit('close', null)
  }
}

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-command-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(tempRoot, { recursive: true, force: true })
})

describe('CommandRunner', () => {
  it('runs a command without a shell and captures output', async () => {
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const runner = new CommandRunner({ spawnProcess: spawnProcess as never })

    const resultPromise = runner.run({
      args: ['test', '--run'],
      command: 'npm.cmd',
      cwd: tempRoot,
      timeoutMs: 5000,
    })
    await waitFor(() => spawnProcess.mock.calls.length > 0)
    child.stdout.write('ok')
    child.stderr.write('warn')
    child.emit('close', 0)

    await expect(resultPromise).resolves.toMatchObject({
      args: ['test', '--run'],
      command: 'npm.cmd',
      cwd: tempRoot,
      exitCode: 0,
      outputTruncated: false,
      stderr: 'warn',
      stdout: 'ok',
      timedOut: false,
      timeoutMs: 5000,
    })
    expect(spawnProcess).toHaveBeenCalledWith(
      'npm.cmd',
      ['test', '--run'],
      expect.objectContaining({
        cwd: tempRoot,
        shell: false,
        windowsHide: true,
      }),
    )
  })

  it('passes only an explicit non-secret environment allowlist to child processes', async () => {
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const runner = new CommandRunner({
      environment: {
        API_TOKEN: 'must-not-leak',
        NODE_OPTIONS: '--require attacker.js',
        PATH: 'C:\\tools',
        SystemRoot: 'C:\\Windows',
        TEMP: 'C:\\Temp',
      },
      spawnProcess: spawnProcess as never,
    })

    const resultPromise = runner.run({ command: 'node', cwd: tempRoot })
    await waitFor(() => spawnProcess.mock.calls.length > 0)
    child.emit('close', 0)
    await resultPromise

    const options = (spawnProcess.mock.calls[0] as unknown as [string, string[], { env?: NodeJS.ProcessEnv }])?.[2]
    expect(options?.env).toEqual({
      PATH: 'C:\\tools',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
    })
    expect(options?.env).not.toHaveProperty('API_TOKEN')
    expect(options?.env).not.toHaveProperty('NODE_OPTIONS')
  })

  it('kills commands that exceed the timeout', async () => {
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const runner = new CommandRunner({ spawnProcess: spawnProcess as never })

    const resultPromise = runner.run({
      command: 'node',
      cwd: tempRoot,
      timeoutMs: 1,
    })
    await waitFor(() => spawnProcess.mock.calls.length > 0)

    const result = await resultPromise

    expect(child.killed).toBe(true)
    expect(result).toMatchObject({
      exitCode: null,
      timedOut: true,
    })
  })

  it('settles after the grace period when a killed process never closes', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess()
    child.kill = vi.fn(() => {
      child.killed = true
    })
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => child) as never })
    const resultPromise = runner.run({ command: 'node', cwd: tempRoot, timeoutMs: 10 })
    await vi.waitFor(() => expect(child.listenerCount('close')).toBeGreaterThan(0))
    await vi.advanceTimersByTimeAsync(1_010)

    await expect(resultPromise).resolves.toMatchObject({ exitCode: null, timedOut: true })
    expect(child.kill).toHaveBeenCalledTimes(2)
  })

  it('rejects relative cwd paths', async () => {
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => new FakeChildProcess()) as never })

    await expect(runner.run({
      command: 'node',
      cwd: 'relative',
    })).rejects.toThrow('Expected an absolute path')
  })

  it('rejects file cwd paths', async () => {
    const filePath = path.join(tempRoot, 'not-a-directory.txt')
    await writeFile(filePath, 'x')
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => new FakeChildProcess()) as never })

    await expect(runner.run({
      command: 'node',
      cwd: filePath,
    })).rejects.toThrow('Command cwd must be a directory')
  })

  it('rejects command paths', async () => {
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => new FakeChildProcess()) as never })

    await expect(runner.run({
      command: 'C:\\Windows\\System32\\cmd.exe',
      cwd: tempRoot,
    })).rejects.toThrow('Command must be an executable name, not a path')
  })

  it('rejects invalid timeouts', async () => {
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => new FakeChildProcess()) as never })

    await expect(runner.run({
      command: 'node',
      cwd: tempRoot,
      timeoutMs: 0,
    })).rejects.toThrow('Command timeout must be between 1 and 120000 ms')
  })

  it('caps captured output', async () => {
    const child = new FakeChildProcess()
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => child) as never })

    const resultPromise = runner.run({
      command: 'node',
      cwd: tempRoot,
    })
    await waitFor(() => child.listenerCount('close') > 0)
    child.stdout.write('x'.repeat(70 * 1024))
    child.emit('close', 0)

    const result = await resultPromise

    expect(result.outputTruncated).toBe(true)
    expect(result.stdout.length).toBe(64 * 1024)
  })

  it('caps UTF-8 output without splitting a multibyte character', async () => {
    const child = new FakeChildProcess()
    const runner = new CommandRunner({ spawnProcess: vi.fn(() => child) as never })
    const resultPromise = runner.run({ command: 'node', cwd: tempRoot })
    await waitFor(() => child.listenerCount('close') > 0)

    child.stdout.write('你'.repeat(30_000))
    child.emit('close', 0)
    const result = await resultPromise

    expect(result.outputTruncated).toBe(true)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(64 * 1024)
    expect(result.stdout).not.toContain('�')
  })
})

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
  }

  throw new Error('Timed out waiting for condition')
}
