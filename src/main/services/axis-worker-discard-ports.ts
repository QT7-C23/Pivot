import type {
  AxisWorkerDiscardCreateInput,
  AxisWorkerDiscardReceipt,
} from '../../shared/axis-worker-discard-contracts'

export interface AxisWorkerDiscardPort {
  discard(input: AxisWorkerDiscardCreateInput): AxisWorkerDiscardReceipt
  findByDecision(decisionId: string): AxisWorkerDiscardReceipt | null
}
