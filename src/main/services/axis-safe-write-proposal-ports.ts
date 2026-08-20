import type {
  AxisModelUsage,
  AxisRunState,
  AxisTask,
} from '../../shared/axis-engine-contracts'
import type { AxisProjectBinding } from '../../shared/axis-project-binding-contracts'
import type { AxisGuardedTaskBinding } from './axis-guarded-safe-write-ports'

export interface AxisSafeWriteProposalSource {
  content: string
  filePath: string
  sha256: string | null
  state: 'existing' | 'missing'
}

export interface AxisSafeWriteProposalFileReaderPort {
  readAll(
    binding: AxisProjectBinding,
    filePaths: string[],
  ): Promise<AxisSafeWriteProposalSource[]>
}

export interface AxisSafeWriteProposalModelInput {
  objective: string
  sources: Array<Pick<AxisSafeWriteProposalSource, 'content' | 'filePath' | 'state'>>
  task: AxisTask
}

export interface AxisSafeWriteProposalModelPort {
  /** Produces review data only. It cannot invoke tools or mutate the workspace. */
  generate(input: AxisSafeWriteProposalModelInput): Promise<{
    output: unknown
    usage: AxisModelUsage
  }>
}

export interface AxisSafeWriteProposalRunStatePort {
  find(binding: Pick<AxisGuardedTaskBinding, 'runId' | 'sessionId'>): AxisRunState | null
  recordUsage(request: {
    durationMs: number
    expectedRevision: number
    runId: string
    sessionId: string
    taskId: string
    usage: AxisModelUsage
  }): AxisRunState
}
