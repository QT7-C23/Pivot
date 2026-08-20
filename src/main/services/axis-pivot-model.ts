import type {
  AxisModelUsage,
  AxisPivotAction,
  AxisPivotTrigger,
  AxisRemainingBudget,
} from '../../shared/axis-engine-contracts'

export interface AxisPivotGeneration {
  output: unknown
  usage: AxisModelUsage
}

export interface AxisPivotModelInput {
  allowedActions: AxisPivotAction[]
  objective: string
  remainingBudget: AxisRemainingBudget
  runId: string
  sessionId: string
  sourceRevision: number
  sourceStatus: 'failed' | 'paused'
  trigger: AxisPivotTrigger
}

/** Read-only model boundary. It may propose an allowed route but cannot mutate run state or invoke tools. */
export interface AxisPivotModel {
  decidePivot(input: AxisPivotModelInput): Promise<AxisPivotGeneration>
}
