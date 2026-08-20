import type {
  AxisSelfRepairAssignment,
  AxisSelfRepairAssignmentCreateInput,
  AxisWorkerAttemptBeginInput,
  AxisWorkerAttemptBinding,
  AxisWorkerAttemptFinishInput,
  AxisWorkerAttemptLookup,
} from '../../shared/axis-worker-attempt-contracts'

export interface AxisWorkerAttemptReaderPort {
  findLatest(input: AxisWorkerAttemptLookup): AxisWorkerAttemptBinding | null
}

export interface AxisWorkerAttemptLifecyclePort {
  begin(input: AxisWorkerAttemptBeginInput): AxisWorkerAttemptBinding
  finish(input: AxisWorkerAttemptFinishInput): AxisWorkerAttemptBinding
}

export interface AxisSelfRepairAssignmentPort {
  assign(input: AxisSelfRepairAssignmentCreateInput): AxisSelfRepairAssignment
  findByDecision(decisionId: string): AxisSelfRepairAssignment | null
}
