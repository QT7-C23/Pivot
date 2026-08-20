import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextTimelineEntry } from '../../src/shared/types/domain'

const services = vi.hoisted(() => ({ list: vi.fn(), restoreChange: vi.fn(), undo: vi.fn() }))
vi.mock('../../src/renderer/services/context-timeline.service', () => ({ contextTimelineService: services }))

import { useContextTimelineStore } from '../../src/renderer/stores/context-timeline.store'

const entry = (sessionId: string): ContextTimelineEntry => ({
  id: `message-${sessionId}`,
  role: 'user',
  sessionId,
  text: sessionId,
  timestamp: '2026-07-18T08:00:00.000Z',
  type: 'message',
})

beforeEach(() => {
  services.list.mockReset(); services.restoreChange.mockReset(); services.undo.mockReset()
  useContextTimelineStore.setState({ entries: [], error: null, isLoading: false, lastRestore: null, sessionId: null })
})

describe('context timeline store', () => {
  it('ignores a stale response after switching sessions', async () => {
    let resolveFirst!: (value: ContextTimelineEntry[]) => void
    services.list
      .mockReturnValueOnce(new Promise<ContextTimelineEntry[]>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce([entry('session-2')])

    const first = useContextTimelineStore.getState().load('session-1')
    await useContextTimelineStore.getState().load('session-2')
    resolveFirst([entry('session-1')])
    await first

    expect(useContextTimelineStore.getState()).toMatchObject({ entries: [entry('session-2')], sessionId: 'session-2' })
  })

  it('reloads the current timeline after a restore and retains the undo contract', async () => {
    services.list.mockResolvedValueOnce([entry('session-1')]).mockResolvedValueOnce([])
    services.restoreChange.mockResolvedValue({ action: 'restored', filePath: 'C:\\project\\a.ts', restoredAt: '2026-07-18T08:02:00.000Z', reviewId: 'review-1', sessionId: 'session-1', undoCheckpointId: 'checkpoint-undo' })

    await useContextTimelineStore.getState().load('session-1')
    await useContextTimelineStore.getState().restoreChange('review-1')

    expect(services.list).toHaveBeenCalledTimes(2)
    expect(useContextTimelineStore.getState()).toMatchObject({ entries: [], lastRestore: { undoCheckpointId: 'checkpoint-undo' } })
  })
})
