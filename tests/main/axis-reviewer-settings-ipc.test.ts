import { beforeEach, describe, expect, it, vi } from 'vitest'
const handlers = new Map<string, (request: any) => Promise<any>>()
vi.mock('../../src/main/ipc-registration', () => ({ handle: (channel: string, handler: any) => handlers.set(channel, handler) }))
import { registerAxisReviewerSettingsIpc } from '../../src/main/axis-reviewer-settings-ipc'
beforeEach(() => handlers.clear())
describe('Axis Reviewer settings IPC', () => {
  it('exposes only qualification and revisioned routing Ports', async () => {
    const qualify = vi.fn().mockResolvedValue({ evidenceId: 'q' }); const read = vi.fn().mockReturnValue({ revision: 0 }); const update = vi.fn().mockReturnValue({ revision: 1 })
    registerAxisReviewerSettingsIpc({ qualification: { qualify } as never, routing: { read, update } as never })
    await handlers.get('axis:qualify-reviewer')!({ modelId: 'review', providerId: 'p1' })
    await handlers.get('axis:update-reviewer-routing')!({ expectedRevision: 0, routing: {} })
    expect(qualify).toHaveBeenCalledWith({ modelId: 'review', providerId: 'p1' }); expect(update).toHaveBeenCalled()
  })
})
