import { create } from 'zustand'
import type { ContextTimelineEntry, ContextTimelineRestoreResult } from '../../shared/types/domain'
import { contextTimelineService } from '../services/context-timeline.service'

interface ContextTimelineStore {
  entries: ContextTimelineEntry[]
  error: string | null
  isLoading: boolean
  lastRestore: ContextTimelineRestoreResult | null
  sessionId: string | null

  clear: () => void
  load: (sessionId: string) => Promise<void>
  restoreChange: (reviewId: string) => Promise<ContextTimelineRestoreResult | null>
  undoLastRestore: () => Promise<boolean>
}

let loadRequestId = 0

export const useContextTimelineStore = create<ContextTimelineStore>((set, get) => ({
  entries: [],
  error: null,
  isLoading: false,
  lastRestore: null,
  sessionId: null,

  clear() {
    loadRequestId += 1
    set({ entries: [], error: null, isLoading: false, lastRestore: null, sessionId: null })
  },

  async load(sessionId) {
    const requestId = ++loadRequestId
    const sessionChanged = get().sessionId !== sessionId
    set({
      error: null,
      isLoading: true,
      lastRestore: sessionChanged ? null : get().lastRestore,
      sessionId,
    })
    try {
      const entries = await contextTimelineService.list(sessionId)
      if (requestId !== loadRequestId || get().sessionId !== sessionId) return
      set({ entries, error: null, isLoading: false })
    } catch (error) {
      if (requestId !== loadRequestId || get().sessionId !== sessionId) return
      set({
        entries: [],
        error: error instanceof Error ? error.message : 'Failed to load context timeline',
        isLoading: false,
      })
    }
  },

  async restoreChange(reviewId) {
    const sessionId = get().sessionId
    if (!sessionId) return null
    try {
      const result = await contextTimelineService.restoreChange(reviewId)
      if (get().sessionId !== sessionId || result.sessionId !== sessionId) return null
      set({ error: null, lastRestore: result })
      await get().load(sessionId)
      return result
    } catch (error) {
      if (get().sessionId === sessionId) {
        set({ error: error instanceof Error ? error.message : 'Failed to restore file change' })
      }
      return null
    }
  },

  async undoLastRestore() {
    const restore = get().lastRestore
    const sessionId = get().sessionId
    if (!restore || !sessionId || restore.sessionId !== sessionId) return false
    try {
      await contextTimelineService.undo(restore.undoCheckpointId)
      if (get().sessionId !== sessionId) return false
      set({ error: null, lastRestore: null })
      await get().load(sessionId)
      return true
    } catch (error) {
      if (get().sessionId === sessionId) {
        set({ error: error instanceof Error ? error.message : 'Failed to undo timeline restore' })
      }
      return false
    }
  },
}))
