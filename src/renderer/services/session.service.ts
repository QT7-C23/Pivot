import type { SessionGroupRecord, SessionMetadataPatch, SessionRecord } from '../../shared/types/domain'

export const sessionService = {
  list(): Promise<SessionRecord[]> {
    return window.pivot.invoke('session:list', undefined)
  },

  get(id: string): Promise<SessionRecord | null> {
    return window.pivot.invoke('session:get', { id })
  },

  create(projectPath: string, title?: string): Promise<SessionRecord> {
    return window.pivot.invoke('session:create', { projectPath, title })
  },

  openProject(projectPath: string, title?: string): Promise<SessionRecord> {
    return window.pivot.invoke('session:open-project', { projectPath, title })
  },

  delete(id: string): Promise<void> {
    return window.pivot.invoke('session:delete', { id })
  },

  softDelete(id: string): Promise<SessionRecord> {
    return window.pivot.invoke('session:soft-delete', { id })
  },

  undoDelete(id: string): Promise<SessionRecord> {
    return window.pivot.invoke('session:undo-delete', { id })
  },

  setPinned(id: string, isPinned: boolean): Promise<SessionRecord> {
    return window.pivot.invoke('session:set-pinned', { id, isPinned })
  },

  update(id: string, patch: SessionMetadataPatch): Promise<SessionRecord> {
    return window.pivot.invoke('session:update', { id, patch })
  },

  search(query: string): Promise<SessionRecord[]> {
    return window.pivot.invoke('session:search', { query })
  },

  fork(id: string): Promise<SessionRecord> {
    return window.pivot.invoke('session:fork', { id })
  },

  listGroups(): Promise<SessionGroupRecord[]> {
    return window.pivot.invoke('session:list-groups', undefined)
  },

  createGroup(name: string, parentId?: string | null): Promise<SessionGroupRecord> {
    return window.pivot.invoke('session:create-group', { name, parentId })
  },

  renameGroup(id: string, name: string): Promise<SessionGroupRecord> {
    return window.pivot.invoke('session:rename-group', { id, name })
  },

  deleteGroup(id: string): Promise<void> {
    return window.pivot.invoke('session:delete-group', { id })
  },

  export(id: string, format: 'markdown' | 'json'): Promise<string> {
    return window.pivot.invoke('session:export', { id, format })
  },
}
