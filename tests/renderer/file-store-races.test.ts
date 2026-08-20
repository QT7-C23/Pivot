import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileSearchEntry, FileTreeEntry } from '../../src/shared/types/domain'

const services = vi.hoisted(() => ({
  listChildren: vi.fn(),
  listTree: vi.fn(),
  read: vi.fn(),
  search: vi.fn(),
  watch: vi.fn(),
}))

vi.mock('../../src/renderer/services/file.service', () => ({ fileService: services }))

import { useFileStore } from '../../src/renderer/stores/file.store'

beforeEach(() => {
  Object.values(services).forEach((mock) => mock.mockReset())
  services.watch.mockResolvedValue(undefined)
  useFileStore.setState({
    activeFileContent: '',
    activeFilePath: null,
    error: null,
    isSearching: false,
    rootPath: null,
    searchResults: [],
    sessionId: null,
    tree: [],
  })
})

describe('file store request identity', () => {
  it('does not let a slow project tree replace the newer session', async () => {
    const first = deferred<FileTreeEntry[]>()
    const second = deferred<FileTreeEntry[]>()
    services.listTree.mockImplementation((sessionId: string) => sessionId === 'session-a' ? first.promise : second.promise)

    const firstLoad = useFileStore.getState().loadTree('session-a', 'C:\\a')
    const secondLoad = useFileStore.getState().loadTree('session-b', 'C:\\b')
    second.resolve([{ name: 'b.ts', path: 'C:\\b\\b.ts', type: 'file' }])
    await secondLoad
    first.resolve([{ name: 'a.ts', path: 'C:\\a\\a.ts', type: 'file' }])
    await firstLoad

    expect(useFileStore.getState()).toMatchObject({
      rootPath: 'C:\\b',
      sessionId: 'session-b',
      tree: [expect.objectContaining({ name: 'b.ts' })],
    })
  })

  it('keeps the latest file and search result when responses arrive out of order', async () => {
    useFileStore.setState({ rootPath: 'C:\\project', sessionId: 'session-1' })
    const readA = deferred<string>()
    const readB = deferred<string>()
    services.read.mockImplementation((_sessionId: string, filePath: string) => filePath.endsWith('a.ts') ? readA.promise : readB.promise)
    const openA = useFileStore.getState().openFile('C:\\project\\a.ts')
    const openB = useFileStore.getState().openFile('C:\\project\\b.ts')
    readB.resolve('b')
    await openB
    readA.resolve('a')
    await openA

    const searchA = deferred<FileSearchEntry[]>()
    const searchB = deferred<FileSearchEntry[]>()
    services.search.mockImplementation((_sessionId: string, query: string) => query === 'a' ? searchA.promise : searchB.promise)
    const oldSearch = useFileStore.getState().searchFiles('a')
    const newSearch = useFileStore.getState().searchFiles('b')
    searchB.resolve([{ name: 'b.ts', path: 'C:\\project\\b.ts', relativePath: 'b.ts' }])
    await newSearch
    searchA.resolve([{ name: 'a.ts', path: 'C:\\project\\a.ts', relativePath: 'a.ts' }])
    await oldSearch

    expect(useFileStore.getState()).toMatchObject({
      activeFileContent: 'b',
      activeFilePath: 'C:\\project\\b.ts',
      searchResults: [expect.objectContaining({ name: 'b.ts' })],
    })
  })

  it('shows a newly added root file even when it was not in the loaded tree', () => {
    useFileStore.setState({ rootPath: 'C:\\project', sessionId: 'session-1', tree: [] })

    useFileStore.getState().markChanged('C:\\project\\new.ts', 'added')

    expect(useFileStore.getState().tree).toEqual([
      expect.objectContaining({ changeType: 'added', depth: 0, name: 'new.ts', type: 'file' }),
    ])
  })
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}
