import { create } from 'zustand'
import type { FileReviewRecord, FileReviewResolution } from '../../shared/types/domain'
import { fileReviewService } from '../services/file-review.service'

interface FileReviewStore {
  activeReview: FileReviewRecord | null
  error: string | null
  isLoading: boolean
  reviews: FileReviewRecord[]
  sessionId: string | null

  clearActive: () => void
  load: (sessionId: string) => Promise<void>
  openById: (reviewId: string) => Promise<boolean>
  openForFile: (filePath: string) => Promise<boolean>
  resolveActive: (resolution: FileReviewResolution) => Promise<FileReviewRecord | null>
}

let loadRequestId = 0

export const useFileReviewStore = create<FileReviewStore>((set, get) => ({
  activeReview: null,
  error: null,
  isLoading: false,
  reviews: [],
  sessionId: null,

  clearActive() {
    set({ activeReview: null, error: null })
  },

  async load(sessionId) {
    const requestId = ++loadRequestId
    set({ error: null, isLoading: true, sessionId })
    try {
      const reviews = await fileReviewService.list(sessionId)
      if (requestId !== loadRequestId || get().sessionId !== sessionId) return
      const activeReviewId = get().activeReview?.id
      set({
        activeReview: reviews.find((review) => review.id === activeReviewId) ?? null,
        error: null,
        isLoading: false,
        reviews,
      })
    } catch (error) {
      if (requestId === loadRequestId) {
        set({
          error: error instanceof Error ? error.message : 'Failed to load file reviews',
          isLoading: false,
          reviews: [],
        })
      }
    }
  },

  async openForFile(filePath) {
    let review = get().reviews.find((candidate) => candidate.filePath === filePath)
    const sessionId = get().sessionId
    if (!review && sessionId) {
      await get().load(sessionId)
      review = get().reviews.find((candidate) => candidate.filePath === filePath)
    }
    set({ activeReview: review ?? null })
    return Boolean(review)
  },

  async openById(reviewId) {
    try {
      const review = await fileReviewService.get(reviewId)
      if (!review || (get().sessionId && review.sessionId !== get().sessionId)) {
        set({ activeReview: null })
        return false
      }
      set({ activeReview: review, error: null })
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to open file review' })
      return false
    }
  },

  async resolveActive(resolution) {
    const activeReview = get().activeReview
    if (!activeReview) return null
    try {
      const resolved = await fileReviewService.resolve(activeReview.id, resolution)
      set((state) => ({
        activeReview: resolved,
        error: null,
        reviews: resolved.status === 'pending'
          ? state.reviews.map((review) => review.id === resolved.id ? resolved : review)
          : state.reviews.filter((review) => review.id !== resolved.id),
      }))
      return resolved
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to resolve file review' })
      return null
    }
  },
}))
