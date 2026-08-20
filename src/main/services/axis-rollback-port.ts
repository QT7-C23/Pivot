import type {
  AxisCheckpointReceipt,
  AxisRollbackOutcome,
} from '../../shared/axis-engine-contracts'

export interface AxisRollbackRequest {
  projectRoot: string
  receipts: AxisCheckpointReceipt[]
  runId: string
  sessionId: string
  taskId: string
}

export interface AxisRollbackPort {
  rollback(input: AxisRollbackRequest): Promise<AxisRollbackOutcome[]>
}
