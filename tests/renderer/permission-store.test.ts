import { beforeEach, describe, expect, it } from 'vitest'
import { usePermissionStore } from '../../src/renderer/stores/permission.store'

beforeEach(() => {
  usePermissionStore.setState({ error: null, pending: [] })
})

describe('permission store', () => {
  it('dismisses a timed-out request when the main process resolves it', () => {
    usePermissionStore.getState().addRequest({
      input: {},
      requestId: 'permission-1',
      runId: 'run-1',
      sessionId: 'session-1',
      toolName: 'term.run',
    })

    usePermissionStore.getState().dismissRequest('permission-1')

    expect(usePermissionStore.getState().pending).toEqual([])
  })
})
