import { EventEmitter } from 'node:events'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectFileWatcher } from '../../src/main/services/project-file-watcher'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('ProjectFileWatcher', () => {
  it('maps normalized chokidar events to the project change contract and releases the owner watcher', async () => {
    const emitter = new EventEmitter()
    const close = vi.fn(async () => undefined)
    const watchFactory = vi.fn((_rootPath: string, _options: unknown) => Object.assign(emitter, { close }))
    const onChange = vi.fn()
    const watcher = new ProjectFileWatcher(watchFactory as never)

    await watcher.watch(7, 'session-1', 'C:\\project', onChange)
    emitter.emit('change', 'C:\\project\\src\\app.ts')
    emitter.emit('add', 'C:\\project\\src\\new.ts')
    emitter.emit('unlink', 'C:\\project\\src\\old.ts')

    expect(onChange.mock.calls.map(([change]) => change)).toEqual([
      { action: 'modify', path: 'C:\\project\\src\\app.ts', sessionId: 'session-1' },
      { action: 'add', path: 'C:\\project\\src\\new.ts', sessionId: 'session-1' },
      { action: 'delete', path: 'C:\\project\\src\\old.ts', sessionId: 'session-1' },
    ])

    await watcher.disposeOwner(7)
    expect(close).toHaveBeenCalledOnce()
  })

  it('releases every renderer watcher bound to a revoked session', async () => {
    const closeFirst = vi.fn(async () => undefined)
    const closeSecond = vi.fn(async () => undefined)
    const closeOther = vi.fn(async () => undefined)
    const watchers = [closeFirst, closeSecond, closeOther]
    const watchFactory = vi.fn(() => Object.assign(new EventEmitter(), { close: watchers.shift()! }))
    const watcher = new ProjectFileWatcher(watchFactory as never)

    await watcher.watch(7, 'session-revoked', 'C:\\project', vi.fn())
    await watcher.watch(8, 'session-revoked', 'C:\\project', vi.fn())
    await watcher.watch(9, 'session-active', 'C:\\other', vi.fn())
    await watcher.disposeSession('session-revoked')

    expect(closeFirst).toHaveBeenCalledOnce()
    expect(closeSecond).toHaveBeenCalledOnce()
    expect(closeOther).not.toHaveBeenCalled()
  })

  it('does not report disposal complete until the underlying watcher has closed', async () => {
    let releaseClose: (() => void) | null = null
    const close = vi.fn(() => new Promise<void>((resolve) => { releaseClose = resolve }))
    const watcher = new ProjectFileWatcher(
      vi.fn(() => Object.assign(new EventEmitter(), { close })) as never,
    )
    await watcher.watch(7, 'session-1', 'C:\\project', vi.fn())

    let disposed = false
    const disposal = watcher.disposeAll().then(() => { disposed = true })
    await Promise.resolve()

    expect(disposed).toBe(false)
    expect(releaseClose).not.toBeNull()
    ;(releaseClose as unknown as () => void)()
    await disposal
    expect(disposed).toBe(true)
  })

  it('passes standard and project gitignore rules into the watcher implementation', async () => {
    const root = path.join(os.tmpdir(), `pivot-watch-${Date.now()}`)
    temporaryRoots.push(root)
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, '.gitignore'), 'coverage/\n*.log\n!keep.log\n')

    const emitter = new EventEmitter()
    const watchFactory = vi.fn((_rootPath: string, _options: unknown) => Object.assign(emitter, { close: vi.fn() }))
    const onChange = vi.fn()
    const watcher = new ProjectFileWatcher(watchFactory as never)
    await watcher.watch(7, 'session-1', root, onChange)

    const options = watchFactory.mock.calls[0]?.[1] as {
      ignored: (candidate: string, stats?: { isDirectory(): boolean }) => boolean
    }
    const directoryStats = { isDirectory: () => true }
    expect(options.ignored(path.join(root, 'node_modules'), directoryStats as never)).toBe(true)
    expect(options.ignored(path.join(root, 'coverage'), directoryStats as never)).toBe(true)
    expect(options.ignored(path.join(root, 'debug.log'))).toBe(true)
    expect(options.ignored(path.join(root, 'keep.log'))).toBe(false)

    emitter.emit('change', path.join(root, '..', 'secret.txt'))
    emitter.emit('change', path.join(root, 'node_modules', 'package', 'index.js'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
