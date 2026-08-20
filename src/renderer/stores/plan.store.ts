import { create } from 'zustand'
import type { PlanDocument, PlanDraftInput, PlanExecutionMode } from '../../shared/types/domain'
import { planService } from '../services/plan.service'

interface PlanStore {
  activePlan: PlanDocument | null
  error: string | null
  isBusy: boolean
  plans: PlanDocument[]
  approve: (mode: PlanExecutionMode, selectedStepIds?: string[]) => Promise<void>
  cancel: () => Promise<void>
  execute: () => Promise<void>
  executeNext: () => Promise<void>
  generate: (sessionId: string, source: string) => Promise<void>
  load: (sessionId: string) => Promise<void>
  loadAll: () => Promise<void>
  open: (id: string) => void
  receive: (plan: PlanDocument) => void
  updateDraft: (draft: PlanDraftInput) => Promise<void>
}

export const usePlanStore = create<PlanStore>((set, get) => ({
  activePlan: null,
  error: null,
  isBusy: false,
  plans: [],

  async loadAll() {
    try {
      set({ error: null, plans: await planService.listAll() })
    } catch (error) {
      set({ error: message(error, 'Failed to load work plans'), plans: [] })
    }
  },

  async load(sessionId) {
    try {
      const plans = await planService.list(sessionId)
      set((state) => ({
        activePlan: plans[0] ?? null,
        error: null,
        plans: [...plans, ...state.plans.filter((plan) => plan.sessionId !== sessionId)],
      }))
    } catch (error) {
      set({ error: message(error, 'Failed to load plans'), plans: [] })
    }
  },
  async generate(sessionId, source) {
    set({ error: null, isBusy: true })
    try {
      get().receive(await planService.generate(sessionId, source))
    } catch (error) {
      set({ error: message(error, 'Failed to generate plan') })
    } finally {
      set({ isBusy: false })
    }
  },
  async updateDraft(draft) {
    const plan = get().activePlan
    if (!plan) return
    try {
      get().receive(await planService.update(plan.id, draft))
    } catch (error) {
      set({ error: message(error, 'Failed to refine plan') })
    }
  },
  async approve(mode, selectedStepIds) {
    const plan = get().activePlan
    if (!plan) return
    try {
      get().receive(await planService.approve(plan.id, mode, selectedStepIds))
    } catch (error) {
      set({ error: message(error, 'Failed to approve plan') })
    }
  },
  async execute() {
    const plan = get().activePlan
    if (!plan) return
    set({ isBusy: true })
    try {
      get().receive(await planService.execute(plan.id))
    } catch (error) {
      set({ error: message(error, 'Plan execution paused after an error') })
    } finally {
      set({ isBusy: false })
    }
  },
  async executeNext() {
    const plan = get().activePlan
    if (!plan) return
    set({ isBusy: true })
    try {
      get().receive(await planService.executeNext(plan.id))
    } catch (error) {
      set({ error: message(error, 'Plan step failed') })
    } finally {
      set({ isBusy: false })
    }
  },
  async cancel() {
    const plan = get().activePlan
    if (!plan) return
    get().receive(await planService.cancel(plan.id))
  },
  open(id) {
    set((state) => ({ activePlan: state.plans.find((plan) => plan.id === id) ?? state.activePlan }))
  },
  receive(plan) {
    set((state) => ({
      activePlan: plan,
      error: null,
      plans: [plan, ...state.plans.filter((candidate) => candidate.id !== plan.id)],
    }))
  },
}))

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
