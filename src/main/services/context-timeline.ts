import type {
  ChatMessage,
  ContextTimelineEntry,
  ContextTimelineFileEntry,
  ContextTimelineRestoreResult,
  FileCheckpointRecord,
  FileReviewRecord,
} from '../../shared/types/domain'
import { deleteProjectFile } from './file-system'

interface TimelineCheckpointPort {
  create(sessionId: string, projectRoot: string, filePath: string): Promise<FileCheckpointRecord>
  get(checkpointId: string): FileCheckpointRecord | null
  restore(checkpointId: string, projectRoot: string): Promise<unknown>
}

interface TimelineReviewPort {
  get(reviewId: string): FileReviewRecord | null
  listForSession(sessionId: string, includeResolved?: boolean): FileReviewRecord[]
}

interface TimelineSessionPort {
  addMessage(sessionId: string, role: ChatMessage['role'], text: string): ChatMessage
  listMessages(sessionId: string): ChatMessage[]
}

export interface ContextTimelineOptions {
  checkpoints: TimelineCheckpointPort
  projectRootForSession: (sessionId: string) => string | null
  reviews: TimelineReviewPort
  sessions: TimelineSessionPort
}

export class ContextTimelineService {
  constructor(private readonly options: ContextTimelineOptions) {}

  list(sessionId: string): ContextTimelineEntry[] {
    const messages: ContextTimelineEntry[] = this.options.sessions.listMessages(sessionId).map((message) => ({
      ...message,
      type: 'message',
    }))
    const changes = this.options.reviews.listForSession(sessionId, true).map(toFileEntry)
    return [...messages, ...changes].sort((left, right) => (
      right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id)
    ))
  }

  async restoreChange(reviewId: string): Promise<ContextTimelineRestoreResult> {
    const review = this.options.reviews.get(reviewId)
    if (!review) throw new Error(`File review not found: ${reviewId}`)
    const projectRoot = this.options.projectRootForSession(review.sessionId)
    if (!projectRoot) throw new Error(`Session project is unavailable: ${review.sessionId}`)

    const undoCheckpoint = await this.options.checkpoints.create(review.sessionId, projectRoot, review.filePath)
    let action: ContextTimelineRestoreResult['action']
    if (review.checkpointId) {
      const checkpoint = this.options.checkpoints.get(review.checkpointId)
      if (!checkpoint || checkpoint.sessionId !== review.sessionId || checkpoint.filePath !== review.filePath) {
        throw new Error('Review checkpoint does not match its session and file')
      }
      await this.options.checkpoints.restore(checkpoint.id, projectRoot)
      action = 'restored'
    } else {
      await deleteProjectFile(projectRoot, review.filePath)
      action = 'deleted'
    }

    const restoredAt = new Date().toISOString()
    this.options.sessions.addMessage(
      review.sessionId,
      'system',
      action === 'deleted'
        ? `File removed by timeline restore: ${review.filePath}`
        : `File restored from timeline checkpoint: ${review.filePath}`,
    )
    return {
      action,
      filePath: review.filePath,
      restoredAt,
      reviewId,
      sessionId: review.sessionId,
      undoCheckpointId: undoCheckpoint.id,
    }
  }
}

function toFileEntry(review: FileReviewRecord): ContextTimelineFileEntry {
  return {
    additions: review.hunks.reduce((total, hunk) => total + changedLineCount(hunk.modifiedContent), 0),
    checkpointId: review.checkpointId,
    deletions: review.hunks.reduce((total, hunk) => total + changedLineCount(hunk.originalContent), 0),
    filePath: review.filePath,
    id: `timeline-${review.id}`,
    reviewId: review.id,
    sessionId: review.sessionId,
    status: review.status,
    timestamp: review.createdAt,
    type: 'file-change',
  }
}

function changedLineCount(content: string): number {
  if (!content) return 0
  const lines = content.split('\n').length
  return content.endsWith('\n') ? lines - 1 : lines
}
