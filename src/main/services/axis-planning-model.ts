import type { AxisModelUsage, AxisPlanningContext, ComplexityReport } from '../../shared/axis-engine-contracts'

export interface AxisStructuredGeneration {
  output: unknown
  usage: AxisModelUsage
}

/** Model boundary only. It cannot execute tools, access runtime state, or mutate the workspace. */
export interface AxisPlanningModel {
  assessComplexity(input: { context: AxisPlanningContext; objective: string }): Promise<AxisStructuredGeneration>
  decomposeTask(input: {
    complexity: ComplexityReport
    context: AxisPlanningContext
    objective: string
  }): Promise<AxisStructuredGeneration>
}
