import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileReviewRecord } from '../../src/shared/types/domain'

const services = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('../../src/renderer/services/file-review.service', () => ({ fileReviewService: services }))

import { useFileReviewStore } from '../../src/renderer/stores/file-review.store'

const pendingReview = {
  checkpointId: 'checkpoint-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  currentContent: 'after',
  filePath: 'C:\\project\\source.ts',
  hunks: [],
  id: 'review-1',
  modifiedContent: 'after',
  originalContent: 'before',
  sessionId: 'session-1',
  status: 'pending',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies FileReviewRecord

beforeEach(() => {
  services.list.mockReset()
  services.get.mockReset()
  services.resolve.mockReset()
  useFileReviewStore.setState({ activeReview: null, error: null, isLoading: false, reviews: [], sessionId: null })
})

describe('file review store', () => {
  it('opens a pending review for an Agent-modified file', async () => {
    services.list.mockResolvedValue([pendingReview])

    await useFileReviewStore.getState().load('session-1')
    const opened = await useFileReviewStore.getState().openForFile('C:\\project\\source.ts')

    expect(opened).toBe(true)
    expect(useFileReviewStore.getState().activeReview).toEqual(pendingReview)
  })

  it('opens a resolved historical review by id for the timeline diff', async () => {
    const resolvedReview = { ...pendingReview, status: 'accepted' as const }
    services.get.mockResolvedValue(resolvedReview)
    useFileReviewStore.setState({ sessionId: 'session-1' })

    const opened = await useFileReviewStore.getState().openById('review-1')

    expect(opened).toBe(true)
    expect(useFileReviewStore.getState().activeReview).toEqual(resolvedReview)
  })
})
