import path from 'node:path'
import { watch as watchWithChokidar, type ChokidarOptions } from 'chokidar'
import { loadGitignore } from './gitignore'

export type ProjectFileChange = {
  action: 'add' | 'delete' | 'modify'
  path: string
  sessionId: string
}

type WatchEvent = 'add' | 'change' | 'unlink' | 'error'

interface FileWatcherPort {
  close(): Promise<void> | void
  on(event: WatchEvent, listener: (...args: never[]) => void): FileWatcherPort
}

type WatchFactory = (rootPath: string, options: ChokidarOptions) => FileWatcherPort

const defaultWatchFactory: WatchFactory = (rootPath, options) => watchWithChokidar(rootPath, options)

export class ProjectFileWatcher {
  private readonly watchers = new Map<number, { sessionId: string; watcher: FileWatcherPort }>()

  constructor(
    private readonly watchFactory: WatchFactory = defaultWatchFactory,
    private readonly reportError: (error: Error) => void = (error) => console.error('Project file watcher failed:', error),
  ) {}

  async watch(
    ownerId: number,
    sessionId: string,
    rootPath: string,
    onChange: (change: ProjectFileChange) => void,
  ): Promise<void> {
    await this.closeOwner(ownerId)
    const normalizedRoot = path.resolve(rootPath)
    const isGitignored = await loadGitignore(normalizedRoot)
    const watcher = this.watchFactory(normalizedRoot, {
      atomic: 100,
      awaitWriteFinish: { pollInterval: 50, stabilityThreshold: 200 },
      followSymlinks: false,
      ignoreInitial: true,
      ignored: (candidatePath, stats) => isGitignored(
        path.resolve(candidatePath),
        stats?.isDirectory() ? 'directory' : 'file',
      ),
      persistent: true,
    })

    const emit = (action: ProjectFileChange['action'], candidatePath: string): void => {
      const absolutePath = path.resolve(candidatePath)
      const relativePath = path.relative(normalizedRoot, absolutePath)
      if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return
      if (isGitignored(absolutePath)) return
      onChange({ action, path: absolutePath, sessionId })
    }

    watcher
      .on('add', ((candidatePath: string) => emit('add', candidatePath)) as never)
      .on('change', ((candidatePath: string) => emit('modify', candidatePath)) as never)
      .on('unlink', ((candidatePath: string) => emit('delete', candidatePath)) as never)
      .on('error', ((error: Error) => this.reportError(error)) as never)
    this.watchers.set(ownerId, { sessionId, watcher })
  }

  disposeOwner(ownerId: number): Promise<void> {
    return this.closeOwner(ownerId)
  }

  async disposeSession(sessionId: string): Promise<void> {
    const disposals: Promise<void>[] = []
    for (const [ownerId, entry] of this.watchers) {
      if (entry.sessionId === sessionId) disposals.push(this.disposeOwner(ownerId))
    }
    await Promise.all(disposals)
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.watchers.keys()].map((ownerId) => this.disposeOwner(ownerId)))
  }

  private async closeOwner(ownerId: number): Promise<void> {
    const entry = this.watchers.get(ownerId)
    this.watchers.delete(ownerId)
    await entry?.watcher.close()
  }
}
