import type { FileReviewRecord, FileReviewResolution } from '../../shared/types/domain'

export const fileReviewService = {
  list(sessionId: string, includeResolved = false): Promise<FileReviewRecord[]> {
    return window.pivot.invoke('fs:list-reviews', { includeResolved, sessionId })
  },

  get(reviewId: string): Promise<FileReviewRecord | null> {
    return window.pivot.invoke('fs:get-review', { reviewId })
  },

  resolve(reviewId: string, resolution: FileReviewResolution): Promise<FileReviewRecord> {
    return window.pivot.invoke('fs:resolve-review', { resolution, reviewId })
  },
}
