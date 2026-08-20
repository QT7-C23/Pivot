import { create } from 'zustand'
import type { AxisReviewerQualificationEvidence, AxisReviewerRouting, AxisReviewerRoutingConfig } from '../../shared/axis-reviewer-qualification-contracts'

interface State { config: AxisReviewerRoutingConfig | null; error: string | null; evidence: AxisReviewerQualificationEvidence | null; loading: boolean; load(): Promise<void>; qualify(providerId: string, modelId: string): Promise<void>; update(routing: AxisReviewerRouting): Promise<void> }
let qualificationRequest = 0
export const useAxisReviewerSettingsStore = create<State>((set, get) => ({
  config: null, error: null, evidence: null, loading: false,
  async load() { try { const raw = await window.pivot.invoke('axis:get-reviewer-routing', undefined); const { AxisReviewerRoutingConfigSchema } = await import('../../shared/axis-reviewer-qualification-contracts'); set({ config: AxisReviewerRoutingConfigSchema.parse(raw), error: null }) } catch (error) { set({ error: message(error) }) } },
  async qualify(providerId, modelId) {
    const request = ++qualificationRequest
    set({ loading: true, error: null })
    try {
      const raw = await window.pivot.invoke('axis:qualify-reviewer', { modelId, providerId })
      const { AxisReviewerQualificationEvidenceSchema } = await import('../../shared/axis-reviewer-qualification-contracts')
      const evidence = AxisReviewerQualificationEvidenceSchema.parse(raw)
      if (evidence.providerId !== providerId || evidence.modelId !== modelId) throw new Error('Qualification ownership mismatch')
      if (request === qualificationRequest) set({ evidence })
    } catch (error) {
      if (request === qualificationRequest) set({ evidence: null, error: message(error) })
    } finally {
      if (request === qualificationRequest) set({ loading: false })
    }
  },
  async update(routing) {
    const config = get().config
    if (!config) return
    set({ loading: true, error: null })
    try {
      const raw = await window.pivot.invoke('axis:update-reviewer-routing', { expectedRevision: config.revision, routing })
      const { AxisReviewerRoutingConfigSchema } = await import('../../shared/axis-reviewer-qualification-contracts')
      const updated = AxisReviewerRoutingConfigSchema.parse(raw)
      if (updated.revision !== config.revision + 1) throw new Error('Reviewer routing revision mismatch')
      if (JSON.stringify(updated.routing) !== JSON.stringify(routing)) throw new Error('Reviewer routing response mismatch')
      set({ config: updated })
    } catch (error) { set({ error: message(error) }) } finally { set({ loading: false }) }
  },
}))
function message(error: unknown): string { return error instanceof Error ? error.message : 'Reviewer settings failed' }
