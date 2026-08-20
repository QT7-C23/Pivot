import { describe, expect, it } from 'vitest'
import {
  FeedbackAttachmentDiscardRequestSchema,
  FeedbackRecordSchema,
  FeedbackSubmissionRequestSchema,
} from '../../src/shared/feedback'

describe('feedback shared contract', () => {
  it('accepts a strict local-outbox submission and record', () => {
    const request = FeedbackSubmissionRequestSchema.parse({
      attachmentIds: ['11111111-1111-4111-8111-111111111111'],
      description: 'The editor becomes slow after opening a large project.',
      priority: 'medium',
      submissionId: '22222222-2222-4222-8222-222222222222',
      title: 'Editor slows down',
      type: 'bug-report',
    })
    expect(request.title).toBe('Editor slows down')

    expect(FeedbackRecordSchema.parse({
      ...request,
      attachments: [{
        byteLength: 42,
        id: request.attachmentIds[0],
        name: 'trace.log',
      }],
      createdAt: '2026-08-03T12:00:00.000Z',
      schemaVersion: 1,
      status: 'saved-locally',
    }).status).toBe('saved-locally')
  })

  it('rejects authority fields, blank content, excessive attachments and malformed records', () => {
    expect(FeedbackAttachmentDiscardRequestSchema.parse({
      attachmentId: '11111111-1111-4111-8111-111111111111',
    })).toEqual({ attachmentId: '11111111-1111-4111-8111-111111111111' })
    expect(() => FeedbackAttachmentDiscardRequestSchema.parse({
      attachmentId: '11111111-1111-4111-8111-111111111111', filePath: 'D:\\secret.log',
    })).toThrow()
    expect(() => FeedbackSubmissionRequestSchema.parse({
      attachmentIds: [], description: 'Details', priority: 'urgent',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Problem',
      type: 'bug-report', databasePath: 'D:\\forged.sqlite',
    })).toThrow()
    expect(() => FeedbackSubmissionRequestSchema.parse({
      attachmentIds: [], description: ' ', priority: 'low',
      submissionId: '22222222-2222-4222-8222-222222222222', title: ' ',
      type: 'other',
    })).toThrow()
    expect(() => FeedbackSubmissionRequestSchema.parse({
      attachmentIds: Array.from({ length: 6 }, (_, index) => `11111111-1111-4111-8111-11111111111${index}`),
      description: 'Details', priority: 'high',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Problem',
      type: 'feature-request',
    })).toThrow()
    expect(() => FeedbackRecordSchema.parse({ status: 'in-progress' })).toThrow()
  })
})
