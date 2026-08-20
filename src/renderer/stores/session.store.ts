import { create } from 'zustand'
import type {
  ProjectHistoryEntry,
  SessionGroupRecord,
  SessionMetadataPatch,
  SessionRecord,
} from '../../shared/types/domain'
import { projectService } from '../services/project.service'
import { sessionService } from '../services/session.service'

export type Session = SessionRecord

const MAX_RECENT_PROJECTS = 8

function upsertProjectEntry(
  recentProjects: ProjectHistoryEntry[],
  session: SessionRecord,
): ProjectHistoryEntry[] {
  return [
    { lastOpenedAt: session.updatedAt, path: session.projectPath, title: session.title },
    ...recentProjects.filter((item) => item.path !== session.projectPath),
  ].slice(0, MAX_RECENT_PROJECTS)
}

export interface SessionStore {
  sessions: Session[]
  groups: SessionGroupRecord[]
  activeSessionId: string | null
  lastDeleted: SessionRecord | null
  lastProject: ProjectHistoryEntry | null
  recentProjects: ProjectHistoryEntry[]
  error: string | null

  chooseProjectDirectory: (defaultPath?: string) => Promise<string | null>
  setActiveSession: (id: string) => void
  loadProjectHistory: () => Promise<void>
  loadSessions: () => Promise<void>
  createSession: (projectPath: string) => Promise<Session>
  openProjectSession: (projectPath: string) => Promise<Session>
  deleteSession: (id: string) => Promise<void>
  pinSession: (id: string) => Promise<void>
  updateSession: (id: string, patch: SessionMetadataPatch) => Promise<void>
  searchSessions: (query: string) => Promise<void>
  forkSession: (id: string) => Promise<Session>
  softDeleteSession: (id: string) => Promise<void>
  undoLastDelete: () => Promise<void>
  exportSession: (id: string, format: 'markdown' | 'json') => Promise<string>
  createGroup: (name: string, parentId?: string | null) => Promise<void>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
}

const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  groups: [],
  activeSessionId: null,
  lastDeleted: null,
  lastProject: null,
  recentProjects: [],
  error: null,

  async chooseProjectDirectory(defaultPath) {
    try {
      const projectPath = await projectService.chooseDirectory(defaultPath)
      set({ error: null })
      return projectPath
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to choose project directory'
      set({ error: message })
      throw new Error(message)
    }
  },

  setActiveSession: (activeSessionId) => {
    set({ activeSessionId })
  },

  async loadSessions() {
    try {
      const [sessions, groups] = await Promise.all([sessionService.list(), sessionService.listGroups()])
      set((state) => ({
        activeSessionId: state.activeSessionId ?? sessions[0]?.id ?? null,
        error: null,
        sessions,
        groups,
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load sessions' })
    }
  },

  async loadProjectHistory() {
    try {
      const [lastProject, recentProjects] = await Promise.all([
        projectService.last(),
        projectService.recent(),
      ])
      set({ error: null, lastProject, recentProjects })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load project history' })
    }
  },

  async createSession(projectPath) {
    try {
      const session = await sessionService.create(projectPath)
      set((state) => ({
        activeSessionId: session.id,
        error: null,
        lastProject: {
          lastOpenedAt: session.updatedAt,
          path: session.projectPath,
          title: session.title,
        },
        recentProjects: upsertProjectEntry(state.recentProjects, session),
        sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      }))
      return session
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session'
      set({ error: message })
      throw new Error(message)
    }
  },

  async openProjectSession(projectPath) {
    try {
      const session = await sessionService.openProject(projectPath)
      set((state) => ({
        activeSessionId: session.id,
        error: null,
        lastProject: {
          lastOpenedAt: session.updatedAt,
          path: session.projectPath,
          title: session.title,
        },
        recentProjects: upsertProjectEntry(state.recentProjects, session),
        sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      }))
      return session
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open project session'
      set({ error: message })
      throw new Error(message)
    }
  },

  async deleteSession(id) {
    await sessionService.delete(id)
    set((state) => ({
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      sessions: state.sessions.filter((session) => session.id !== id),
    }))
  },

  async pinSession(id) {
    const session = get().sessions.find((item) => item.id === id)
    if (!session) {
      return
    }

    try {
      const updated = await sessionService.setPinned(id, !session.isPinned)
      set((state) => ({
        error: null,
        sessions: state.sessions.map((item) => item.id === id ? updated : item),
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to pin session' })
    }
  },

  async updateSession(id, patch) {
    try {
      const updated = await sessionService.update(id, patch)
      set((state) => ({
        error: null,
        sessions: state.sessions.map((session) => session.id === id ? updated : session),
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to update session' })
    }
  },

  async searchSessions(query) {
    try {
      const sessions = query.trim() ? await sessionService.search(query) : await sessionService.list()
      set({ error: null, sessions })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to search sessions' })
    }
  },

  async forkSession(id) {
    const session = await sessionService.fork(id)
    set((state) => ({
      activeSessionId: session.id,
      error: null,
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
    }))
    return session
  },

  async softDeleteSession(id) {
    const deleted = await sessionService.softDelete(id)
    const existingTimer = deleteTimers.get(id)
    if (existingTimer) clearTimeout(existingTimer)
    const timer = setTimeout(() => {
      deleteTimers.delete(id)
      void sessionService.delete(id).then(() => {
        set((state) => ({ lastDeleted: state.lastDeleted?.id === id ? null : state.lastDeleted }))
      }).catch((error: unknown) => {
        set({ error: error instanceof Error ? error.message : 'Failed to finalize session deletion' })
      })
    }, 5_000)
    deleteTimers.set(id, timer)
    set((state) => ({
      activeSessionId: state.activeSessionId === id
        ? state.sessions.find((session) => session.id !== id)?.id ?? null
        : state.activeSessionId,
      error: null,
      lastDeleted: deleted,
      sessions: state.sessions.filter((session) => session.id !== id),
    }))
  },

  async undoLastDelete() {
    const deleted = get().lastDeleted
    if (!deleted) return
    const timer = deleteTimers.get(deleted.id)
    if (timer) clearTimeout(timer)
    deleteTimers.delete(deleted.id)
    const restored = await sessionService.undoDelete(deleted.id)
    set((state) => ({
      error: null,
      lastDeleted: null,
      sessions: [restored, ...state.sessions.filter((session) => session.id !== restored.id)],
    }))
  },

  exportSession(id, format) {
    return sessionService.export(id, format)
  },

  async createGroup(name, parentId) {
    const group = await sessionService.createGroup(name, parentId)
    set((state) => ({ error: null, groups: [...state.groups, group] }))
  },

  async renameGroup(id, name) {
    const group = await sessionService.renameGroup(id, name)
    set((state) => ({
      error: null,
      groups: state.groups.map((candidate) => candidate.id === id ? group : candidate),
    }))
  },

  async deleteGroup(id) {
    await sessionService.deleteGroup(id)
    set((state) => ({
      error: null,
      groups: state.groups.filter((group) => group.id !== id),
      sessions: state.sessions.map((session) => session.groupId === id ? { ...session, groupId: null } : session),
    }))
  },
}))
