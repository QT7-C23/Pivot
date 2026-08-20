import { create } from 'zustand'
import type { FileSearchEntry, FileTreeEntry } from '../../shared/types/domain'
import { fileService } from '../services/file.service'

export type FileChangeType = 'added' | 'modified' | 'deleted'

export interface FileNode extends FileTreeEntry {
  changeType?: FileChangeType
  depth: number
  isExpanded?: boolean
  isLoading?: boolean
}

export interface FileStore {
  tree: FileNode[]
  activeFilePath: string | null
  activeFileContent: string
  error: string | null
  isSearching: boolean
  rootPath: string | null
  sessionId: string | null
  searchResults: FileSearchEntry[]

  clearChanges: () => void
  clearChange: (path: string) => void
  clearSearch: () => void
  collapseDirectory: (dirPath: string) => void
  createDirectory: (parentPath: string, name: string) => Promise<void>
  createFile: (parentPath: string, name: string) => Promise<void>
  expandDirectory: (dirPath: string) => Promise<void>
  loadTree: (sessionId: string, rootPath: string) => Promise<void>
  markChanged: (path: string, changeType: FileChangeType) => void
  openFile: (filePath: string) => Promise<void>
  reveal: (filePath: string) => Promise<void>
  searchFiles: (query: string) => Promise<void>
}

function withDepth(entries: FileTreeEntry[], depth: number): FileNode[] {
  return entries.map((entry) => ({ ...entry, depth }))
}

function isDescendant(parentPath: string, candidatePath: string): boolean {
  const normalizedParent = parentPath.replaceAll('\\', '/')
  const normalizedCandidate = candidatePath.replaceAll('\\', '/')
  return normalizedCandidate.startsWith(`${normalizedParent}/`)
}

let treeRequestId = 0
let openRequestId = 0
let searchRequestId = 0

export const useFileStore = create<FileStore>((set, get) => ({
  tree: [],
  activeFilePath: null,
  activeFileContent: '',
  error: null,
  isSearching: false,
  rootPath: null,
  sessionId: null,
  searchResults: [],

  async loadTree(sessionId, rootPath) {
    const requestId = ++treeRequestId
    openRequestId += 1
    searchRequestId += 1
    set({
      activeFileContent: '',
      activeFilePath: null,
      error: null,
      isSearching: false,
      rootPath,
      searchResults: [],
      sessionId,
      tree: [],
    })
    try {
      const [tree] = await Promise.all([
        fileService.listTree(sessionId),
        fileService.watch(sessionId),
      ])
      if (requestId !== treeRequestId || get().sessionId !== sessionId) return
      set({
        error: null,
        tree: withDepth(tree, 0),
      })
    } catch (error) {
      if (requestId === treeRequestId && get().sessionId === sessionId) {
        set({ error: error instanceof Error ? error.message : 'Failed to load file tree' })
      }
    }
  },

  async expandDirectory(dirPath) {
    const existing = get().tree.find((node) => node.path === dirPath)
    if (!existing || existing.type !== 'directory' || existing.isExpanded) {
      return
    }

    set((state) => ({
      tree: state.tree.map((node) => (node.path === dirPath ? { ...node, isLoading: true } : node)),
    }))

    try {
      const sessionId = get().sessionId
      if (!sessionId) {
        throw new Error('Open a project before expanding its files')
      }
      const children = withDepth(await fileService.listChildren(sessionId, dirPath), existing.depth + 1)
      set((state) => {
        if (state.sessionId !== sessionId) return state
        const parentIndex = state.tree.findIndex((node) => node.path === dirPath)
        if (parentIndex === -1) {
          return state
        }

        return {
          error: null,
          tree: [
            ...state.tree.slice(0, parentIndex),
            { ...state.tree[parentIndex], isExpanded: true, isLoading: false },
            ...children,
            ...state.tree.slice(parentIndex + 1),
          ],
        }
      })
    } catch (error) {
      set((state) => ({
        error: error instanceof Error ? error.message : 'Failed to expand directory',
        tree: state.tree.map((node) => (node.path === dirPath ? { ...node, isLoading: false } : node)),
      }))
    }
  },

  collapseDirectory(dirPath) {
    set((state) => ({
      tree: state.tree
        .filter((node) => node.path === dirPath || !isDescendant(dirPath, node.path))
        .map((node) => (node.path === dirPath ? { ...node, isExpanded: false } : node)),
    }))
  },

  async createFile(parentPath, name) {
    const sessionId = get().sessionId
    if (!sessionId) throw new Error('Open a project before creating files')
    try {
      const entry = await fileService.createFile(sessionId, parentPath, name)
      set((state) => ({ error: null, tree: insertEntry(state.tree, parentPath, entry) }))
      await get().openFile(entry.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create file'
      set({ error: message })
      throw new Error(message)
    }
  },

  async createDirectory(parentPath, name) {
    const sessionId = get().sessionId
    if (!sessionId) throw new Error('Open a project before creating directories')
    try {
      const entry = await fileService.createDirectory(sessionId, parentPath, name)
      set((state) => ({ error: null, tree: insertEntry(state.tree, parentPath, entry) }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create directory'
      set({ error: message })
      throw new Error(message)
    }
  },

  markChanged: (path, changeType) => {
    set((state) => {
      const existingIndex = state.tree.findIndex((node) => node.path === path)
      if (existingIndex >= 0) {
        return { tree: state.tree.map((node) => (node.path === path ? { ...node, changeType } : node)) }
      }
      if (changeType !== 'added' || !state.rootPath) return state
      const parentPath = parentDirectory(path)
      const parent = state.tree.find((node) => normalizePath(node.path) === parentPath && node.type === 'directory')
      if (parentPath !== normalizePath(state.rootPath) && !parent?.isExpanded) return state
      const node: FileNode = {
        changeType,
        depth: parent ? parent.depth + 1 : 0,
        name: fileName(path),
        path,
        type: 'file',
      }
      const insertAfter = parent ? lastDescendantIndex(state.tree, parent) + 1 : state.tree.length
      return { tree: [...state.tree.slice(0, insertAfter), node, ...state.tree.slice(insertAfter)] }
    })
  },

  clearChanges: () => {
    set((state) => ({
      tree: state.tree.map(({ changeType: _changeType, ...node }) => node),
    }))
  },

  clearChange: (path) => {
    set((state) => ({
      tree: state.tree.map((node) => {
        if (node.path !== path) return node
        const { changeType: _changeType, ...unchanged } = node
        return unchanged
      }),
    }))
  },

  clearSearch() {
    searchRequestId += 1
    set({ error: null, isSearching: false, searchResults: [] })
  },

  async openFile(activeFilePath) {
    const requestId = ++openRequestId
    try {
      const sessionId = get().sessionId
      if (!sessionId) {
        throw new Error('Open a project before reading files')
      }
      const activeFileContent = await fileService.read(sessionId, activeFilePath)
      if (requestId !== openRequestId || get().sessionId !== sessionId) return
      set({
        activeFileContent,
        activeFilePath,
        error: null,
      })
    } catch (error) {
      if (requestId === openRequestId) {
        set({ error: error instanceof Error ? error.message : 'Failed to open file' })
      }
    }
  },

  async reveal(filePath) {
    const sessionId = get().sessionId
    if (!sessionId) return
    try {
      await fileService.reveal(sessionId, filePath)
      set({ error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to reveal file' })
    }
  },

  async searchFiles(query) {
    const trimmed = query.trim()
    if (!trimmed) {
      get().clearSearch()
      return
    }

    const requestId = ++searchRequestId
    set({ isSearching: true })
    try {
      const sessionId = get().sessionId
      if (!sessionId) {
        throw new Error('Open a project before searching files')
      }
      const searchResults = await fileService.search(sessionId, trimmed, 40)
      if (requestId !== searchRequestId || get().sessionId !== sessionId) return
      set({ error: null, isSearching: false, searchResults })
    } catch (error) {
      if (requestId === searchRequestId) {
        set({
          error: error instanceof Error ? error.message : 'Failed to search files',
          isSearching: false,
          searchResults: [],
        })
      }
    }
  },
}))

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/$/, '')
}

function parentDirectory(value: string): string {
  const normalized = normalizePath(value)
  return normalized.slice(0, normalized.lastIndexOf('/'))
}

function fileName(value: string): string {
  return normalizePath(value).split('/').at(-1) ?? value
}

function lastDescendantIndex(tree: FileNode[], parent: FileNode): number {
  let index = tree.findIndex((node) => node.path === parent.path)
  while (tree[index + 1] && tree[index + 1].depth > parent.depth) index += 1
  return index
}

function insertEntry(tree: FileNode[], parentPath: string, entry: FileTreeEntry): FileNode[] {
  if (tree.some((node) => normalizePath(node.path) === normalizePath(entry.path))) return tree
  const parent = tree.find((node) => normalizePath(node.path) === normalizePath(parentPath))
  const rootPath = normalizePath(parentPath)
  const isRootEntry = !parent && tree.every((node) => parentDirectory(node.path) === rootPath || node.depth > 0)
  if (!parent && !isRootEntry) return tree
  if (parent && !parent.isExpanded) return tree
  const next: FileNode = { ...entry, changeType: 'added', depth: parent ? parent.depth + 1 : 0 }
  const insertAt = parent ? lastDescendantIndex(tree, parent) + 1 : tree.length
  return [...tree.slice(0, insertAt), next, ...tree.slice(insertAt)]
}
