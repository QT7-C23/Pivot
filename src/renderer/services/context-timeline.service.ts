import type { ContextTimelineEntry, ContextTimelineRestoreResult } from '../../shared/types/domain'

export const contextTimelineService = {
  list(sessionId: string): Promise<ContextTimelineEntry[]> {
    return window.pivot.invoke('timeline:list', { sessionId })
  },

  restoreChange(reviewId: string): Promise<ContextTimelineRestoreResult> {
    return window.pivot.invoke('timeline:restore-change', { reviewId })
  },

  undo(checkpointId: string): Promise<unknown> {
    return window.pivot.invoke('fs:restore-checkpoint', { checkpointId })
  },
}
