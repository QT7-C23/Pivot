import type {
  AxisPivotDecisionRecord,
  AxisPlanLineage,
  AxisPlanningContext,
  AxisReplanRequest,
  AxisRunState,
  AxisShadowRunResult,
} from '../../shared/axis-engine-contracts'

export interface AxisPivotDecisionReaderPort {
  find(decisionId: string): AxisPivotDecisionRecord | null
}

export interface AxisPivotRunStateReaderPort {
  find(input: { runId: string; sessionId: string }): AxisRunState | null
}

export interface AxisPivotRetryStatePort extends AxisPivotRunStateReaderPort {
  scheduleRetry(input: {
    decisionId: string
    expectedRevision: number
    runId: string
    sessionId: string
    taskId: string
  }): AxisRunState
}

export interface AxisPivotAssignmentStatePort
extends AxisPivotRunStateReaderPort {
  scheduleAssignment(input: {
    action: 'self-repair' | 'dedicated-fixer'
    decisionId: string
    expectedRevision: number
    runId: string
    sessionId: string
    taskId: string
  }): AxisRunState
}

export interface AxisPivotStopStatePort extends AxisPivotRunStateReaderPort {
  stopPivot(input: {
    decisionId: string
    expectedRevision: number
    reason: string
    runId: string
    sessionId: string
    taskId: string | null
  }): AxisRunState
}

export interface AxisPivotPlanningContextPort {
  resolve(input: { runId: string; sessionId: string }): Promise<AxisPlanningContext>
}

export interface AxisPivotProjectFileListPort {
  list(projectRoot: string): Promise<string[]>
}

export interface AxisPivotReplanPortResult {
  lineage: AxisPlanLineage
  plan: AxisShadowRunResult
}

export interface AxisPivotReplanPort {
  findCompleted(input: {
    parentRunId: string
    sessionId: string
    sourceRevision: number
  }): AxisPivotReplanPortResult | null
  replan(request: AxisReplanRequest): Promise<AxisPivotReplanPortResult>
}
