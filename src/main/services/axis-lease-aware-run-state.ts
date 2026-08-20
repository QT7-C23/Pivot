import type {
  AxisDryRunApprovalRequest,
  AxisRunState,
  AxisRunStateTransitionRequest,
} from '../../shared/axis-engine-contracts'
import type { AxisDryRunStateStore } from './axis-dry-run-coordinator'
import type { AxisGuardedRunStatePort } from './axis-guarded-safe-write-ports'
import type {
  AxisCheckpointEvaluationRequest,
  AxisPermissionEvaluationRequest,
  AxisReviewEvaluationRequest,
  AxisRunPauseRequest,
  AxisTaskCompletionRequest,
  AxisTaskStateTransitionRequest,
} from './axis-run-state-registry'
import type { AxisLeaseLifecyclePort } from './axis-run-lease-lifecycle'

type TerminalRunStatus = Extract<
  AxisRunState['status'],
  'cancelled' | 'completed' | 'failed'
>

export class AxisLeaseAwareRunStateStore implements AxisDryRunStateStore {
  private readonly lifecycle: AxisLeaseLifecyclePort
  private readonly states: AxisDryRunStateStore & {
    cancel(request: AxisRunStateTransitionRequest): AxisRunState
    claimGuardedTask(request: Parameters<AxisGuardedRunStatePort['claimTask']>[0]): AxisRunState
    finishGuardedTask(request: Parameters<AxisGuardedRunStatePort['finishTask']>[0]): AxisRunState
  }

  constructor(options: {
    lifecycle: AxisLeaseLifecyclePort
    states: AxisDryRunStateStore & {
      cancel(request: AxisRunStateTransitionRequest): AxisRunState
      claimGuardedTask(request: Parameters<AxisGuardedRunStatePort['claimTask']>[0]): AxisRunState
      finishGuardedTask(request: Parameters<AxisGuardedRunStatePort['finishTask']>[0]): AxisRunState
    }
  }) {
    this.lifecycle = options.lifecycle
    this.states = options.states
  }

  cancel(request: AxisRunStateTransitionRequest): AxisRunState {
    return this.commit(() => this.states.cancel(request))
  }

  completeRun(request: AxisRunStateTransitionRequest): AxisRunState {
    return this.commit(() => this.states.completeRun(request))
  }

  completeTask(request: AxisTaskCompletionRequest): AxisRunState {
    return this.commit(() => this.states.completeTask(request))
  }

  get(runId: string): AxisRunState | null {
    return this.states.get(runId)
  }

  pause(request: AxisRunPauseRequest): AxisRunState {
    return this.states.pause(request)
  }

  recordCheckpoint(request: AxisCheckpointEvaluationRequest): AxisRunState {
    return this.commit(() => this.states.recordCheckpoint(request))
  }

  recordPermission(request: AxisPermissionEvaluationRequest): AxisRunState {
    return this.commit(() => this.states.recordPermission(request))
  }

  recordReview(request: AxisReviewEvaluationRequest): AxisRunState {
    return this.commit(() => this.states.recordReview(request))
  }

  startDryRun(request: AxisDryRunApprovalRequest): AxisRunState {
    return this.states.startDryRun(request)
  }

  startTask(request: AxisTaskStateTransitionRequest): AxisRunState {
    return this.states.startTask(request)
  }

  openGuardedExecutionPort(): AxisGuardedRunStatePort {
    return Object.freeze({
      claimTask: (
        request: Parameters<AxisGuardedRunStatePort['claimTask']>[0],
      ) => this.states.claimGuardedTask(request),
      finishTask: (
        request: Parameters<AxisGuardedRunStatePort['finishTask']>[0],
      ) => this.commit(
        () => this.states.finishGuardedTask(request),
      ),
    })
  }

  private commit(transition: () => AxisRunState): AxisRunState {
    const state = transition()
    const reason = terminalReason(state.status)
    if (reason) {
      this.lifecycle.cleanup({
        reason,
        runId: state.runId,
        scope: 'run',
        sessionId: state.sessionId,
      })
    }
    return state
  }
}

function terminalReason(
  status: AxisRunState['status'],
): TerminalRunStatus | null {
  return status === 'cancelled' || status === 'completed' || status === 'failed'
    ? status
    : null
}
