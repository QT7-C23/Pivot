import type {
  FeedbackAttachment,
  FeedbackRecord,
  FeedbackSubmissionRequest,
} from '../../shared/feedback'

export interface FeedbackReaderPort {
  list(): FeedbackRecord[]
}

export interface FeedbackWriterPort {
  submit(request: FeedbackSubmissionRequest): FeedbackRecord
}

export interface FeedbackAttachmentStagingPort {
  stagePaths(paths: readonly string[]): FeedbackAttachment[]
}

export interface FeedbackAttachmentDiscardPort {
  discard(attachmentId: string): void
}
