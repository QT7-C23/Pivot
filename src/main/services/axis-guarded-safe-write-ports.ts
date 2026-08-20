import type {
  AxisGuardedSafeWriteResult,
  AxisRunState,
  AxisTask,
  WorkerResult,
} from '../../shared/axis-engine-contracts'
import type { AxisVerifiedReviewedProposal } from './axis-reviewed-proposal-ports'

export interface AxisGuardedSafeWriteExecutionRequest {
  projectRoot: string
  reviewedProposal: AxisVerifiedReviewedProposal
  runId: string
  sessionId: string
  signal?: AbortSignal
  task: AxisTask
  writes: Array<{ content: string; filePath: string }>
}

export interface AxisGuardedSafeWriteExecutionPort {
  execute(
    request: AxisGuardedSafeWriteExecutionRequest,
  ): Promise<AxisGuardedSafeWriteResult>
}

export interface AxisGuardedTaskBinding {
  runId: string
  sessionId: string
  taskId: string
}

export interface AxisGuardedTaskReaderPort {
  findTask(binding: AxisGuardedTaskBinding): AxisTask | null
}

export interface AxisGuardedTaskClaimRequest extends AxisGuardedTaskBinding {
  dependencyTaskIds: string[]
  expectedRevision: number
}

export interface AxisGuardedTaskFinishRequest {
  expectedRevision: number
  result: WorkerResult
  runId: string
  sessionId: string
}

export interface AxisGuardedRunStatePort {
  claimTask(request: AxisGuardedTaskClaimRequest): AxisRunState
  finishTask(request: AxisGuardedTaskFinishRequest): AxisRunState
}
