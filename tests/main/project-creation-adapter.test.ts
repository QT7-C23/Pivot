import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeProjectCreationAdapter } from '../../src/main/services/node-project-creation-adapter'
import type { ProjectCreationCommandPort } from '../../src/main/services/project-creation-port'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pivot-project-creation-'))
})

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true })
})

describe('NodeProjectCreationAdapter', () => {
  it('creates a bounded workspace, README, Git repository, and remote without a shell', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, stderr: '', timedOut: false }))
    const adapter = new NodeProjectCreationAdapter({ commandRunner: { run } })

    const result = await adapter.create(request({
      description: 'Real project evidence.',
      remoteOriginUrl: 'https://github.com/example/real-project.git',
    }))

    expect(result).toEqual({
      initializedGit: true,
      projectPath: path.join(await realpath(tempRoot), 'real-project'),
      remoteOriginConfigured: true,
      schemaVersion: 1,
    })
    expect(await readFile(path.join(result.projectPath, 'README.md'), 'utf8')).toBe('# real-project\n\nReal project evidence.\n')
    expect(run).toHaveBeenNthCalledWith(1, { args: ['init'], command: 'git', cwd: result.projectPath, timeoutMs: 30_000 })
    expect(run).toHaveBeenNthCalledWith(2, { args: ['remote', 'add', 'origin', 'https://github.com/example/real-project.git'], command: 'git', cwd: result.projectPath, timeoutMs: 30_000 })
  })

  it('refuses an existing target and preserves its contents', async () => {
    const target = path.join(tempRoot, 'real-project')
    await mkdir(target)
    await writeFile(path.join(target, 'owned.txt'), 'keep', 'utf8')
    const adapter = new NodeProjectCreationAdapter({ commandRunner: successfulRunner() })

    await expect(adapter.create(request())).rejects.toThrow('already exists')
    await expect(readFile(path.join(target, 'owned.txt'), 'utf8')).resolves.toBe('keep')
  })

  it('removes only the newly-created target when Git initialization fails', async () => {
    const adapter = new NodeProjectCreationAdapter({
      commandRunner: { run: vi.fn(async () => ({ exitCode: 1, stderr: 'git failed', timedOut: false })) },
    })

    await expect(adapter.create(request())).rejects.toThrow('Git initialization failed')
    await expect(access(path.join(tempRoot, 'real-project'))).rejects.toThrow()
    await expect(access(tempRoot)).resolves.toBeUndefined()
  })

  it('does not invoke Git when the request disables repository initialization', async () => {
    const runner = successfulRunner()
    const adapter = new NodeProjectCreationAdapter({ commandRunner: runner })

    const result = await adapter.create(request({ initializeGit: false, remoteOriginUrl: undefined }))

    expect(result.initializedGit).toBe(false)
    expect(result.remoteOriginConfigured).toBe(false)
    expect(runner.run).not.toHaveBeenCalled()
  })
})

function request(overrides: Partial<Parameters<NodeProjectCreationAdapter['create']>[0]> = {}) {
  return {
    description: '',
    initializeGit: true,
    parentPath: tempRoot,
    projectName: 'real-project',
    schemaVersion: 1 as const,
    ...overrides,
  }
}

function successfulRunner(): ProjectCreationCommandPort {
  return { run: vi.fn(async () => ({ exitCode: 0, stderr: '', timedOut: false })) }
}
