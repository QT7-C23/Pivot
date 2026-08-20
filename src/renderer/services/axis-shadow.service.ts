import type { AxisDryRunApprovalRequest, AxisDryRunFeatureState, AxisRunState, AxisRunStateTransitionRequest, AxisShadowPlanRequest, AxisShadowRunResult, AxisShadowState, BudgetEnvelope } from '../../shared/axis-engine-contracts'
import type {
  AxisGuardedSafeWriteFeatureState,
  AxisGuardedSafeWriteSubmission,
  AxisGuardedSafeWriteSubmissionResult,
} from '../../shared/axis-guarded-safe-write-contracts'
import type {
  AxisSafeWriteProposalRequest,
  AxisSafeWriteProposalResult,
} from '../../shared/axis-safe-write-proposal-contracts'

export const DEFAULT_AXIS_SHADOW_BUDGET: BudgetEnvelope = {
  maxCostUsd: 0.25,
  maxDurationMs: 120_000,
  maxGateCyclesPerFile: 2,
  maxPivots: 0,
  maxRetriesPerTask: 0,
  maxTokens: 20_000,
  maxWorkers: 4,
}

export const axisShadowService = {
  state(): Promise<AxisShadowState> {
    return window.pivot.invoke('axis:shadow-state', {})
  },
  setEnabled(enabled: boolean): Promise<AxisShadowState> {
    return window.pivot.invoke('axis:set-shadow-enabled', { enabled })
  },
  plan(sessionId: string, objective: string, budget: BudgetEnvelope = DEFAULT_AXIS_SHADOW_BUDGET): Promise<AxisShadowRunResult> {
    const request: AxisShadowPlanRequest = { budget, objective, sessionId }
    return window.pivot.invoke('axis:plan-shadow', request)
  },
  listRuns(sessionId: string): Promise<AxisShadowRunResult[]> {
    return window.pivot.invoke('axis:list-shadow-runs', { sessionId })
  },
  listRunStates(sessionId: string): Promise<AxisRunState[]> {
    return window.pivot.invoke('axis:list-run-states', { sessionId })
  },
  cancelRun(request: AxisRunStateTransitionRequest): Promise<AxisRunState> {
    return window.pivot.invoke('axis:cancel-run', request)
  },
  restartRun(request: AxisRunStateTransitionRequest): Promise<AxisRunState> {
    return window.pivot.invoke('axis:restart-run', request)
  },
  dryRunState(): Promise<AxisDryRunFeatureState> {
    return window.pivot.invoke('axis:dry-run-state', {})
  },
  setDryRunEnabled(enabled: boolean): Promise<AxisDryRunFeatureState> {
    return window.pivot.invoke('axis:set-dry-run-enabled', { enabled })
  },
  executeDryRun(request: AxisDryRunApprovalRequest): Promise<AxisRunState> {
    return window.pivot.invoke('axis:execute-dry-run', request)
  },
  guardedSafeWriteState(): Promise<AxisGuardedSafeWriteFeatureState> {
    return window.pivot.invoke('axis:guarded-safe-write-state', {})
  },
  proposeGuardedSafeWrite(
    request: AxisSafeWriteProposalRequest,
  ): Promise<AxisSafeWriteProposalResult> {
    return window.pivot.invoke('axis:propose-guarded-safe-write', request)
  },
  executeGuardedSafeWrite(
    request: AxisGuardedSafeWriteSubmission,
  ): Promise<AxisGuardedSafeWriteSubmissionResult> {
    return window.pivot.invoke('axis:execute-guarded-safe-write', request)
  },
}
