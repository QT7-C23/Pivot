import {
  FeedbackAttachmentSchema,
  FeedbackAttachmentDiscardRequestSchema,
  FeedbackHistorySchema,
  FeedbackRecordSchema,
  FeedbackSubmissionRequestSchema,
  type FeedbackAttachment,
  type FeedbackRecord,
  type FeedbackSubmissionRequest,
} from '../../shared/feedback'

type FeedbackChannel =
  | 'settings:list-feedback'
  | 'settings:choose-feedback-attachments'
  | 'settings:discard-feedback-attachment'
  | 'settings:submit-feedback'

export type FeedbackInvoke = (
  channel: FeedbackChannel,
  request: FeedbackSubmissionRequest | { attachmentId: string } | undefined,
) => Promise<unknown>

export interface FeedbackClientPort {
  chooseAttachments(): Promise<FeedbackAttachment[]>
  discardAttachment(attachmentId: string): Promise<void>
  list(): Promise<FeedbackRecord[]>
  submit(request: FeedbackSubmissionRequest): Promise<FeedbackRecord>
}

export function createFeedbackClient(
  invoke: FeedbackInvoke = (channel, request) => window.pivot.invoke(channel, request as never),
): FeedbackClientPort {
  return Object.freeze({
    async chooseAttachments() {
      const response = await invoke('settings:choose-feedback-attachments', undefined)
      if (!Array.isArray(response)) throw new Error('Invalid feedback attachment response')
      return response.map((attachment) => FeedbackAttachmentSchema.parse(attachment))
    },
    async discardAttachment(attachmentId: string) {
      const request = FeedbackAttachmentDiscardRequestSchema.parse({ attachmentId })
      await invoke('settings:discard-feedback-attachment', request)
    },
    async list() {
      return FeedbackHistorySchema.parse(await invoke('settings:list-feedback', undefined))
    },
    async submit(input: FeedbackSubmissionRequest) {
      const request = FeedbackSubmissionRequestSchema.parse(input)
      return FeedbackRecordSchema.parse(await invoke('settings:submit-feedback', request))
    },
  })
}
