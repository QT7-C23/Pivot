import { useEffect } from 'react'
import type { SignalMap } from '../../shared/signal-channel'
import { useFileStore, type FileChangeType } from '../stores/file.store'
import { useFileReviewStore } from '../stores/file-review.store'
import { useContextTimelineStore } from '../stores/context-timeline.store'

type MarkChanged = (path: string, changeType: FileChangeType) => void
type FileSignalHandler = (payload: SignalMap['file:changed']) => void
type OnFileSignal = (signal: 'file:changed', handler: FileSignalHandler) => () => void
type SystemFileSignalHandler = (payload: SignalMap['file:system-changed']) => void

const FILE_CHANGE_BY_ACTION = {
  add: 'added',
  delete: 'deleted',
  modify: 'modified',
} satisfies Record<SignalMap['file:changed']['action'], FileChangeType>

export function subscribeFileSignals(
  markChanged: MarkChanged,
  onSignal: OnFileSignal = (signal, handler) => window.pivot.onSignal(signal, handler),
  sessionId?: string | null,
  onChanged?: () => void,
): () => void {
  return onSignal('file:changed', ({ action, path, sessionId: changedSessionId }) => {
    if (!sessionId || sessionId === changedSessionId) {
      markChanged(path, FILE_CHANGE_BY_ACTION[action])
      onChanged?.()
    }
  })
}

export function subscribeSystemFileSignals(
  markChanged: MarkChanged,
  onSignal: (signal: 'file:system-changed', handler: SystemFileSignalHandler) => () => void =
    (signal, handler) => window.pivot.onSignal(signal, handler),
  sessionId?: string | null,
): () => void {
  return onSignal('file:system-changed', ({ action, path, sessionId: changedSessionId }) => {
    if (!sessionId || sessionId === changedSessionId) markChanged(path, FILE_CHANGE_BY_ACTION[action])
  })
}

export function useFileSignals(): void {
  const markChanged = useFileStore((state) => state.markChanged)
  const sessionId = useFileStore((state) => state.sessionId)
  const loadReviews = useFileReviewStore((state) => state.load)
  const loadTimeline = useContextTimelineStore((state) => state.load)

  useEffect(() => {
    const unsubscribeAgent = subscribeFileSignals(
      markChanged,
      undefined,
      sessionId,
      () => {
        if (!sessionId) return
        void Promise.all([loadReviews(sessionId), loadTimeline(sessionId)])
      },
    )
    const unsubscribeSystem = subscribeSystemFileSignals(markChanged, undefined, sessionId)
    return () => {
      unsubscribeAgent()
      unsubscribeSystem()
    }
  }, [loadReviews, loadTimeline, markChanged, sessionId])
}
