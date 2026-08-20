import type {
  AxisDryRunApprovalRequest,
  AxisRunState,
} from '../shared/axis-engine-contracts'
import type { AxisPivotDispatchResult } from '../shared/axis-pivot-action-contracts'
import type { AxisPivotFailureObservation } from '../shared/axis-pivot-failure-contracts'
import type { AxisPivotReviewedContinuationOrchestration } from '../shared/axis-pivot-reviewed-continuation-contracts'

interface DryRunExecutionPort {
  execute(request: AxisDryRunApprovalRequest): Promise<AxisRunState>
}

interface FailureObservationPort {
  observeFailure(request: AxisPivotFailureObservation): Promise<AxisPivotDispatchResult>
}

interface ReviewedContinuationPort {
  orchestrate(request: { decisionId: string }): Promise<AxisPivotReviewedContinuationOrchestration>
}

interface ReplanDrivePort {
  drive(request: { decisionId: string }): Promise<unknown>
}

interface RunStateReaderPort {
  get(runId: string): AxisRunState | null
}

export class AxisDryRunIpcOrchestrator {
  constructor(private readonly ports: {
    execute: DryRunExecutionPort['execute']
    failureObserver: FailureObservationPort | null
    replanDriver: ReplanDrivePort | null
    reviewedContinuations: ReviewedContinuationPort | null
    stateReader: RunStateReaderPort
  }) {}

  async execute(request: AxisDryRunApprovalRequest): Promise<AxisRunState> {
    const result = await this.ports.execute(request)
    if (result.status !== 'failed' || result.events.at(-1)?.type !== 'task-failed') return result

    const dispatch = await this.ports.failureObserver?.observeFailure(failureRequest(result))
    if (!isGuardedContinuation(dispatch)) return this.authoritative(result)

    const orchestration = await this.ports.reviewedContinuations?.orchestrate({ decisionId: dispatch.decisionId })
    const guardedResult = orchestration?.continuationAttempt?.guardedResult
    if (dispatch.result.action === 'retry' && guardedResult && guardedResult.execution.status !== 'completed') {
      const followup = await this.ports.failureObserver?.observeFailure(failureRequest(guardedResult.runState))
      if (followup?.route === 'continuation' && followup.result.action === 'replan') {
        await this.ports.replanDriver?.drive({ decisionId: followup.decisionId })
      }
    }
    return this.authoritative(result)
  }

  private authoritative(fallback: AxisRunState): AxisRunState {
    return this.ports.stateReader.get(fallback.runId) ?? fallback
  }
}

function failureRequest(state: Pick<AxisRunState, 'revision' | 'runId' | 'sessionId'>): AxisPivotFailureObservation {
  return { expectedRevision: state.revision, runId: state.runId, sessionId: state.sessionId }
}

function isGuardedContinuation(dispatch: AxisPivotDispatchResult | undefined): dispatch is AxisPivotDispatchResult {
  return dispatch?.route === 'continuation' && (
    dispatch.result.action === 'retry'
    || dispatch.result.action === 'self-repair'
    || dispatch.result.action === 'dedicated-fixer'
  )
}
