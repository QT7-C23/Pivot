import { EventEmitter } from 'node:events'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCliProfileRegistry } from '../../src/main/services/agent-cli-profiles'
import { AgentCliProfileStore } from '../../src/main/services/agent-cli-profile-store'

class FakeChildProcess extends EventEmitter {
  killed = false
  stderr = new PassThrough()
  stdout = new PassThrough()

  kill(): boolean {
    this.killed = true
    return true
  }
}

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-agent-cli-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(tempRoot, { recursive: true, force: true })
})

describe('AgentCliProfileRegistry', () => {
  it('defaults to the local profile', () => {
    const registry = new AgentCliProfileRegistry({ env: {} })

    expect(registry.listProfiles().find((profile) => profile.isSelected)?.id).toBe('local')
    expect(registry.createSelectedAdapter().info).toMatchObject({ kind: 'local', profileId: 'local' })
  })

  it('selects custom profile when a custom command is configured', () => {
    const registry = new AgentCliProfileRegistry({
      env: {
        PIVOT_AGENT_ARGS_JSON: '["run","{{prompt}}"]',
        PIVOT_AGENT_COMMAND: 'pivot-agent',
      },
    })

    expect(registry.listProfiles().find((profile) => profile.isSelected)?.id).toBe('custom')
    expect(registry.createSelectedAdapter().info).toMatchObject({
      args: ['run', '{{prompt}}'],
      command: 'pivot-agent',
      kind: 'cli',
      profileId: 'custom',
    })
  })

  it('switches profiles explicitly', () => {
    const registry = new AgentCliProfileRegistry({ env: {} })
    const adapter = registry.selectProfile('codex')

    expect(adapter.info).toMatchObject({ command: 'codex', kind: 'cli', profileId: 'codex' })
    expect(registry.listProfiles().find((profile) => profile.isSelected)?.id).toBe('codex')
  })

  it('persists selected profile through the profile store', () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstStore = new AgentCliProfileStore(databasePath)
    const firstRegistry = new AgentCliProfileRegistry({ env: {}, profileStore: firstStore })
    firstRegistry.selectProfile('claude')
    firstStore.close()

    const secondStore = new AgentCliProfileStore(databasePath)
    const secondRegistry = new AgentCliProfileRegistry({ env: {}, profileStore: secondStore })

    expect(secondRegistry.listProfiles().find((profile) => profile.isSelected)?.id).toBe('claude')

    secondStore.close()
  })

  it('configures and persists the custom profile through the profile store', () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstStore = new AgentCliProfileStore(databasePath)
    const firstRegistry = new AgentCliProfileRegistry({ env: {}, profileStore: firstStore })

    const customProfile = firstRegistry.configureCustomProfile({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'pivot-agent',
      updateCommand: { args: ['self-update'], command: 'pivot-agent' },
      versionCommand: { args: ['--version'], command: 'pivot-agent' },
    })

    expect(customProfile).toMatchObject({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'pivot-agent',
      id: 'custom',
      updateCommand: { args: ['self-update'], command: 'pivot-agent' },
      versionCommand: { args: ['--version'], command: 'pivot-agent' },
    })
    firstStore.close()

    const secondStore = new AgentCliProfileStore(databasePath)
    const secondRegistry = new AgentCliProfileRegistry({ env: {}, profileStore: secondStore })

    expect(secondRegistry.listProfiles().find((profile) => profile.id === 'custom')).toMatchObject({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'pivot-agent',
      updateCommand: { args: ['self-update'], command: 'pivot-agent' },
      versionCommand: { args: ['--version'], command: 'pivot-agent' },
    })

    secondStore.close()
  })

  it('uses a configured custom profile when selected', () => {
    const registry = new AgentCliProfileRegistry({
      env: {},
    })
    registry.configureCustomProfile({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'pivot-agent',
      versionCommand: { args: ['--version'], command: 'pivot-agent' },
    })

    const adapter = registry.selectProfile('custom')

    expect(adapter.info).toMatchObject({
      args: ['run', '{{prompt}}'],
      command: 'pivot-agent',
      kind: 'cli',
      profileId: 'custom',
    })
  })

  it('runs profile version commands and captures output', async () => {
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const registry = new AgentCliProfileRegistry({
      env: {
        PIVOT_CODEX_COMMAND: 'codex-test',
        PIVOT_CODEX_VERSION_ARGS_JSON: '["version"]',
      },
      spawnProcess: spawnProcess as never,
    })

    const resultPromise = registry.runMaintenance('codex', 'version')
    child.stdout.write('codex 1.2.3')
    child.emit('close', 0)

    await expect(resultPromise).resolves.toMatchObject({
      action: 'version',
      command: 'codex-test',
      exitCode: 0,
      output: 'codex 1.2.3',
      outputTruncated: false,
      profileId: 'codex',
      timedOut: false,
    })
    expect(spawnProcess).toHaveBeenCalledWith(
      'codex-test',
      ['version'],
      expect.objectContaining({ shell: false, stdio: 'pipe', windowsHide: true }),
    )
  })

  it('returns an unavailable result when the CLI executable is missing', async () => {
    const child = new FakeChildProcess()
    const registry = new AgentCliProfileRegistry({
      env: {},
      spawnProcess: vi.fn(() => child) as never,
    })

    const resultPromise = registry.runMaintenance('claude', 'version')
    child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))

    await expect(resultPromise).resolves.toMatchObject({
      command: 'claude',
      exitCode: null,
      output: 'Claude Code was not found. Install it or add "claude" to PATH, then try again.',
      profileId: 'claude',
      timedOut: false,
      unavailable: true,
    })
  })

  it('caps profile maintenance output', async () => {
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const registry = new AgentCliProfileRegistry({
      env: {
        PIVOT_CODEX_COMMAND: 'codex-test',
      },
      spawnProcess: spawnProcess as never,
    })

    const resultPromise = registry.runMaintenance('codex', 'version')
    child.stdout.write('x'.repeat(20_000))
    child.emit('close', 0)
    const result = await resultPromise

    expect(result.output.length).toBe(16 * 1024)
    expect(result.outputTruncated).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('times out profile maintenance commands', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const registry = new AgentCliProfileRegistry({
      env: {
        PIVOT_CODEX_COMMAND: 'codex-test',
      },
      spawnProcess: spawnProcess as never,
    })

    const resultPromise = registry.runMaintenance('codex', 'version')
    vi.advanceTimersByTime(30_000)
    child.emit('close', null)
    const result = await resultPromise

    expect(child.killed).toBe(true)
    expect(result).toMatchObject({
      exitCode: null,
      timedOut: true,
    })
  })

  it('fails update when a profile has no explicit update command', async () => {
    const registry = new AgentCliProfileRegistry({ env: {} })

    await expect(registry.runMaintenance('codex', 'update')).rejects.toThrow('does not define a update command')
  })
})
