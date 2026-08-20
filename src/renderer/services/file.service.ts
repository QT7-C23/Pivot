import type {
  FileCheckpointRecord,
  FileCheckpointRestoreResult,
  FileSearchEntry,
  FileTreeEntry,
} from '../../shared/types/domain'

export const fileService = {
  listTree(sessionId: string): Promise<FileTreeEntry[]> {
    return window.pivot.invoke('fs:tree', { sessionId })
  },

  listChildren(sessionId: string, dirPath: string): Promise<FileTreeEntry[]> {
    return window.pivot.invoke('fs:children', { dirPath, sessionId })
  },

  read(sessionId: string, filePath: string): Promise<string> {
    return window.pivot.invoke('fs:read', { filePath, sessionId })
  },

  search(sessionId: string, query: string, limit?: number): Promise<FileSearchEntry[]> {
    return window.pivot.invoke('fs:search', { limit, query, sessionId })
  },

  watch(sessionId: string): Promise<void> {
    return window.pivot.invoke('fs:watch', { sessionId })
  },

  createFile(sessionId: string, parentPath: string, name: string): Promise<FileTreeEntry> {
    return window.pivot.invoke('fs:create-file', { name, parentPath, sessionId })
  },

  createDirectory(sessionId: string, parentPath: string, name: string): Promise<FileTreeEntry> {
    return window.pivot.invoke('fs:create-directory', { name, parentPath, sessionId })
  },

  reveal(sessionId: string, filePath: string): Promise<void> {
    return window.pivot.invoke('fs:reveal', { filePath, sessionId })
  },

  checkpoint(sessionId: string, filePath: string): Promise<FileCheckpointRecord> {
    return window.pivot.invoke('fs:checkpoint', { filePath, sessionId })
  },

  listCheckpoints(sessionId: string): Promise<FileCheckpointRecord[]> {
    return window.pivot.invoke('fs:list-checkpoints', { sessionId })
  },

  restoreCheckpoint(checkpointId: string): Promise<FileCheckpointRestoreResult> {
    return window.pivot.invoke('fs:restore-checkpoint', { checkpointId })
  },

}
