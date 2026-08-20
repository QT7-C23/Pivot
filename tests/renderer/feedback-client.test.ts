import { describe, expect, it, vi } from 'vitest'
import { createFeedbackClient } from '../../src/renderer/services/feedback-client'

describe('feedback Renderer client', () => {
  it('uses only typed feedback channels and validates every Main response', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'settings:list-feedback') return []
      if (channel === 'settings:choose-feedback-attachments') return [{
        byteLength: 16, id: '11111111-1111-4111-8111-111111111111', name: 'trace.log',
      }]
      if (channel === 'settings:discard-feedback-attachment') return undefined
      return {
        attachmentIds: [], attachments: [], createdAt: '2026-08-03T12:00:00.000Z',
        description: 'Details', priority: 'medium', schemaVersion: 1,
        status: 'saved-locally', submissionId: '22222222-2222-4222-8222-222222222222',
        title: 'Title', type: 'bug-report',
      }
    })
    const client = createFeedbackClient(invoke)
    expect(await client.list()).toEqual([])
    expect((await client.chooseAttachments())[0]?.name).toBe('trace.log')
    await client.discardAttachment('11111111-1111-4111-8111-111111111111')
    await client.submit({
      attachmentIds: [], description: 'Details', priority: 'medium',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Title',
      type: 'bug-report',
    })
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      'settings:list-feedback',
      'settings:choose-feedback-attachments',
      'settings:discard-feedback-attachment',
      'settings:submit-feedback',
    ])
  })

  it('fails closed on malformed Main attachment metadata', async () => {
    const client = createFeedbackClient(async () => [{ id: 'forged', name: '../secret', byteLength: -1 }])
    await expect(client.chooseAttachments()).rejects.toThrow()
  })
})
