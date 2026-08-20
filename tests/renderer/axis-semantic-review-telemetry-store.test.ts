import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.stubGlobal('window', { pivot: { invoke } })
import { useAxisSemanticReviewTelemetryStore } from '../../src/renderer/stores/axis-semantic-review-telemetry.store'

beforeEach(() => {
  invoke.mockReset()
  useAxisSemanticReviewTelemetryStore.setState({ error: null, isLoading: false, page: null, sessionId: null })
})

describe('Axis semantic review telemetry store', () => {
  it('loads a bounded session projection and ignores stale session responses', async () => {
    let resolveFirst!: (value: any) => void
    invoke.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ available: true, items: [], schemaVersion: 1, truncated: false, unavailableReason: null })
    const first = useAxisSemanticReviewTelemetryStore.getState().load('session-1')
    await useAxisSemanticReviewTelemetryStore.getState().load('session-2')
    resolveFirst({ available: false, items: [], schemaVersion: 1, truncated: false, unavailableReason: 'disabled' })
    await first
    expect(invoke).toHaveBeenLastCalledWith('axis:list-semantic-review-telemetry', { limit: 50, sessionId: 'session-2' })
    expect(useAxisSemanticReviewTelemetryStore.getState()).toMatchObject({ page: { available: true }, sessionId: 'session-2' })
  })

  it('clears privileged-looking malformed responses and exposes a bounded error', async () => {
    invoke.mockResolvedValue({ apiKey: 'secret', available: true, items: [], schemaVersion: 1, truncated: false, unavailableReason: null })
    await useAxisSemanticReviewTelemetryStore.getState().load('session-1')
    expect(useAxisSemanticReviewTelemetryStore.getState()).toMatchObject({ page: null, isLoading: false })
    expect(useAxisSemanticReviewTelemetryStore.getState().error).toMatch(/invalid/i)
  })
})
