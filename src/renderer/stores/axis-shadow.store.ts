import { create } from 'zustand'
import type {
  AxisDryRunFeatureState,
  AxisGuardedSafeWriteCompletionEvidence,
  AxisRunState,
  AxisShadowRunResult,
  AxisShadowState,
} from '../../shared/axis-engine-contracts'
import type {
  AxisGuardedSafeWriteFeatureState,
  AxisGuardedSafeWriteSubmission,
} from '../../shared/axis-guarded-safe-write-contracts'
import type { AxisSafeWriteProposal } from '../../shared/axis-safe-write-proposal-contracts'
import type { AxisReviewedSafeWriteReceipt } from '../../shared/axis-reviewed-proposal-contracts'
import { axisShadowService } from '../services/axis-shadow.service'

interface AxisShadowStore {
  activeRun: AxisShadowRunResult | null
  dryRunningRunId: string | null
  dryRunState: AxisDryRunFeatureState | null
  error: string | null
  guardedCompletionEvidence: AxisGuardedSafeWriteCompletionEvidence | null
  guardedRunningTaskId: string | null
  guardedProposal: AxisSafeWriteProposal | null
  guardedProposalReceipt: AxisReviewedSafeWriteReceipt | null
  guardedProposingTaskId: string | null
  guardedState: AxisGuardedSafeWriteFeatureState | null
  isPlanning: boolean
  mutatingRunId: string | null
  planningSessionId: string | null
  runStates: AxisRunState[]
  runs: AxisShadowRunResult[]
  sessionId: string | null
  state: AxisShadowState | null
  cancelRun: (runId: string) => Promise<void>
  executeDryRun: (runId: string) => Promise<void>
  executeGuardedSafeWrite: (
    runId: string,
    taskId: string,
    writes: AxisGuardedSafeWriteSubmission['writes'],
  ) => Promise<void>
  loadRuns: (sessionId: string | null) => Promise<void>
  loadState: () => Promise<void>
  openRun: (runId: string) => void
  plan: (sessionId: string, objective: string) => Promise<void>
  proposeGuardedSafeWrite: (runId: string, taskId: string) => Promise<void>
  restartRun: (runId: string) => Promise<void>
  setShadowEnabled: (enabled: boolean) => Promise<void>
  setDryRunEnabled: (enabled: boolean) => Promise<void>
}

export const useAxisShadowStore = create<AxisShadowStore>((set, get) => ({
  activeRun: null,
  dryRunningRunId: null,
  dryRunState: null,
  error: null,
  guardedCompletionEvidence: null,
  guardedRunningTaskId: null,
  guardedProposal: null,
  guardedProposalReceipt: null,
  guardedProposingTaskId: null,
  guardedState: null,
  isPlanning: false,
  mutatingRunId: null,
  planningSessionId: null,
  runStates: [],
  runs: [],
  sessionId: null,
  state: null,
  async loadState() {
    try {
      const [state, dryRunState, guardedState] = await Promise.all([
        axisShadowService.state(),
        axisShadowService.dryRunState(),
        axisShadowService.guardedSafeWriteState(),
      ])
      set({ dryRunState, error: null, guardedState, state })
    }
    catch (error) { set({ error: message(error, 'Failed to load Axis Shadow state') }) }
  },
  async setShadowEnabled(enabled) {
    try { set({ error: null, state: await axisShadowService.setEnabled(enabled) }) }
    catch (error) { set({ error: message(error, 'Failed to update Axis Shadow mode') }) }
  },
  async setDryRunEnabled(enabled) {
    try { set({ dryRunState: await axisShadowService.setDryRunEnabled(enabled), error: null }) }
    catch (error) { set({ error: message(error, 'Failed to update Axis dry-run mode') }) }
  },
  async loadRuns(sessionId) {
    if (!sessionId) {
      set({
        activeRun: null,
        error: null,
        guardedCompletionEvidence: null,
        guardedProposal: null,
        guardedProposalReceipt: null,
        runStates: [],
        runs: [],
        sessionId: null,
      })
      return
    }
    set({
      guardedCompletionEvidence: null,
      guardedProposal: null,
      guardedProposalReceipt: null,
      sessionId,
    })
    try {
      const [runs, runStates] = await Promise.all([
        axisShadowService.listRuns(sessionId),
        axisShadowService.listRunStates(sessionId),
      ])
      if (get().sessionId === sessionId) set({ activeRun: runs[0] ?? null, error: null, runStates, runs })
    } catch (error) {
      if (get().sessionId === sessionId) set({ activeRun: null, error: message(error, 'Failed to load Axis Shadow plans'), runStates: [], runs: [] })
    }
  },
  async plan(sessionId, objective) {
    set({ error: null, isPlanning: true, planningSessionId: sessionId })
    try {
      const run = await axisShadowService.plan(sessionId, objective)
      if (get().sessionId === sessionId && get().planningSessionId === sessionId) {
        set((state) => ({
          activeRun: run,
          guardedCompletionEvidence: null,
          guardedProposal: null,
          guardedProposalReceipt: null,
          runs: [run, ...state.runs.filter((item) => item.trace.runId !== run.trace.runId)],
        }))
        try {
          const runStates = await axisShadowService.listRunStates(sessionId)
          if (get().sessionId === sessionId && get().planningSessionId === sessionId) set({ runStates })
        } catch (error) {
          if (get().sessionId === sessionId && get().planningSessionId === sessionId) {
            set({ error: message(error, 'Plan created, but its durable state could not be loaded') })
          }
        }
      }
    } catch (error) {
      if (get().sessionId === sessionId && get().planningSessionId === sessionId) {
        set({ error: message(error, 'Axis Shadow planning failed') })
      }
    } finally {
      if (get().planningSessionId === sessionId) set({ isPlanning: false, planningSessionId: null })
    }
  },
  openRun(runId) {
    set({
      activeRun: get().runs.find((run) => run.trace.runId === runId) ?? null,
      guardedCompletionEvidence: null,
      guardedProposal: null,
      guardedProposalReceipt: null,
    })
  },
  async cancelRun(runId) {
    const sessionId = get().sessionId
    const state = get().runStates.find((item) => item.runId === runId)
    if (!sessionId || !state) return
    set({ error: null, mutatingRunId: runId })
    try {
      const next = await axisShadowService.cancelRun({ expectedRevision: state.revision, runId, sessionId })
      if (get().sessionId === sessionId) set((current) => ({ runStates: replaceState(current.runStates, next) }))
    } catch (error) {
      if (get().sessionId === sessionId) set({ error: message(error, 'Failed to cancel Axis run') })
    } finally {
      if (get().mutatingRunId === runId) set({ mutatingRunId: null })
    }
  },
  async restartRun(runId) {
    const sessionId = get().sessionId
    const state = get().runStates.find((item) => item.runId === runId)
    if (!sessionId || !state) return
    set({ error: null, mutatingRunId: runId })
    try {
      const next = await axisShadowService.restartRun({ expectedRevision: state.revision, runId, sessionId })
      if (get().sessionId === sessionId) set((current) => ({ runStates: replaceState(current.runStates, next) }))
    } catch (error) {
      if (get().sessionId === sessionId) set({ error: message(error, 'Failed to reopen Axis run') })
    } finally {
      if (get().mutatingRunId === runId) set({ mutatingRunId: null })
    }
  },
  async executeDryRun(runId) {
    const sessionId = get().sessionId
    const state = get().runStates.find((item) => item.runId === runId)
    if (!sessionId || !state || !get().dryRunState?.enabled) return
    set({ dryRunningRunId: runId, error: null })
    try {
      const next = await axisShadowService.executeDryRun({
        approvedTaskIds: state.tasks.map((task) => task.taskId),
        expectedRevision: state.revision,
        runId,
        sessionId,
      })
      if (get().sessionId === sessionId) set((current) => ({ runStates: replaceState(current.runStates, next) }))
    } catch (error) {
      if (get().sessionId === sessionId) {
        set({ error: message(error, 'Axis dry run failed') })
        try {
          const runStates = await axisShadowService.listRunStates(sessionId)
          if (get().sessionId === sessionId) set({ runStates })
        } catch { /* Preserve the original dry-run error. */ }
      }
    } finally {
      if (get().dryRunningRunId === runId) set({ dryRunningRunId: null })
    }
  },
  async proposeGuardedSafeWrite(runId, taskId) {
    const sessionId = get().sessionId
    const state = get().runStates.find((item) => item.runId === runId)
    if (!sessionId || !state || !get().guardedState?.enabled) return
    set({
      error: null,
      guardedCompletionEvidence: null,
      guardedProposal: null,
      guardedProposalReceipt: null,
      guardedProposingTaskId: taskId,
    })
    try {
      const result = await axisShadowService.proposeGuardedSafeWrite({
        expectedRevision: state.revision,
        runId,
        sessionId,
        taskId,
      })
      if (get().sessionId === sessionId) {
        set((current) => ({
          guardedProposal: result.proposal,
          guardedProposalReceipt: result.receipt,
          runStates: replaceState(current.runStates, result.runState),
        }))
      }
    } catch (error) {
      if (get().sessionId === sessionId) {
        set({ error: message(error, 'Axis safe-write proposal failed') })
        try {
          const runStates = await axisShadowService.listRunStates(sessionId)
          if (get().sessionId === sessionId) set({ runStates })
        } catch { /* Preserve the original proposal error. */ }
      }
    } finally {
      if (get().guardedProposingTaskId === taskId) {
        set({ guardedProposingTaskId: null })
      }
    }
  },
  async executeGuardedSafeWrite(runId, taskId, writes) {
    const sessionId = get().sessionId
    const state = get().runStates.find((item) => item.runId === runId)
    const receipt = get().guardedProposalReceipt
    if (
      !sessionId
      || !state
      || !receipt
      || receipt.runId !== runId
      || receipt.sessionId !== sessionId
      || receipt.taskId !== taskId
      || receipt.expectedRevision !== state.revision
    ) return
    set({
      error: null,
      guardedCompletionEvidence: null,
      guardedRunningTaskId: taskId,
    })
    try {
      const result = await axisShadowService.executeGuardedSafeWrite({
        expectedRevision: state.revision,
        reviewedProposalReceipt: receipt,
        runId,
        sessionId,
        taskId,
        writes,
      })
      if (get().sessionId === sessionId) {
        set((current) => ({
          guardedCompletionEvidence: result.execution.completionEvidence,
          guardedProposal: null,
          guardedProposalReceipt: null,
          runStates: replaceState(current.runStates, result.runState),
        }))
      }
    } catch (error) {
      if (get().sessionId === sessionId) {
        set({ error: message(error, 'Axis guarded safe-write failed') })
        try {
          const runStates = await axisShadowService.listRunStates(sessionId)
          if (get().sessionId === sessionId) set({ runStates })
        } catch { /* Preserve the original guarded execution error. */ }
      }
    } finally {
      if (get().guardedRunningTaskId === taskId) {
        set({ guardedRunningTaskId: null })
      }
    }
  },
}))

function replaceState(states: AxisRunState[], next: AxisRunState): AxisRunState[] {
  return states.map((state) => state.runId === next.runId ? next : state)
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
