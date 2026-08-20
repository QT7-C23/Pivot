import type { AxisPivotDispatchResult } from '../../shared/axis-pivot-action-contracts'
import type {
  AxisPivotContinuationHandoff,
  AxisPivotFailureEvidence,
  AxisPivotFailureObservation,
} from '../../shared/axis-pivot-failure-contracts'

export interface AxisPivotFailureEvidenceStorePort {
  findBySource(
    runId: string,
    sourceEventRevision: number,
  ): AxisPivotFailureEvidence | null
  save(evidence: AxisPivotFailureEvidence): AxisPivotFailureEvidence
}

export interface AxisPivotContinuationStorePort {
  findByDecision(decisionId: string): AxisPivotContinuationHandoff | null
  save(handoff: AxisPivotContinuationHandoff): AxisPivotContinuationHandoff
}

export interface AxisPivotFailureObserverPort {
  observeFailure(
    request: AxisPivotFailureObservation,
  ): Promise<AxisPivotDispatchResult>
}

export interface AxisPivotContinuationReaderPort {
  findContinuation(decisionId: string): AxisPivotContinuationHandoff | null
}
