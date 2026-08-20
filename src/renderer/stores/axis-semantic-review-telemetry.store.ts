import { create } from 'zustand'
import type { AxisSemanticReviewTelemetryPage } from '../../shared/axis-semantic-review-telemetry-contracts'

interface AxisSemanticReviewTelemetryStore {
  error: string | null
  isLoading: boolean
  page: AxisSemanticReviewTelemetryPage | null
  sessionId: string | null
  clear(): void
  load(sessionId: string): Promise<void>
}

let loadRequestId = 0

export const useAxisSemanticReviewTelemetryStore = create<AxisSemanticReviewTelemetryStore>((set, get) => ({
  error: null,
  isLoading: false,
  page: null,
  sessionId: null,
  clear() {
    loadRequestId += 1
    set({ error: null, isLoading: false, page: null, sessionId: null })
  },
  async load(sessionId) {
    const requestId = ++loadRequestId
    set({ error: null, isLoading: true, page: null, sessionId })
    try {
      const response = await window.pivot.invoke('axis:list-semantic-review-telemetry', { limit: 50, sessionId })
      const { AxisSemanticReviewTelemetryPageSchema } = await import('../../shared/axis-semantic-review-telemetry-contracts')
      const page = AxisSemanticReviewTelemetryPageSchema.parse(response)
      if (requestId !== loadRequestId || get().sessionId !== sessionId) return
      set({ error: null, isLoading: false, page })
    } catch (error) {
      if (requestId !== loadRequestId || get().sessionId !== sessionId) return
      set({
        error: error instanceof Error ? `Invalid semantic review telemetry: ${error.message}` : 'Invalid semantic review telemetry',
        isLoading: false,
        page: null,
      })
    }
  },
}))
