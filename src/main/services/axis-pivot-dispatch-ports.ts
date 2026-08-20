import type {
  AxisPivotDedicatedFixerActionResult,
  AxisPivotDiscardActionResult,
  AxisPivotDispatchRequest,
  AxisPivotDispatchResult,
  AxisPivotEscalateActionResult,
  AxisPivotReplanActionResult,
  AxisPivotRetryActionResult,
  AxisPivotSelfRepairActionResult,
  AxisPivotStopActionResult,
} from '../../shared/axis-pivot-action-contracts'

export interface AxisPivotActionExecutorPort<TResult> {
  execute(
    request: AxisPivotDispatchRequest,
  ): TResult | Promise<TResult>
}

export interface AxisPivotActionExecutorSet {
  'dedicated-fixer': AxisPivotActionExecutorPort<
    AxisPivotDedicatedFixerActionResult
  >
  discard: AxisPivotActionExecutorPort<AxisPivotDiscardActionResult>
  escalate: AxisPivotActionExecutorPort<AxisPivotEscalateActionResult>
  replan: AxisPivotActionExecutorPort<AxisPivotReplanActionResult>
  retry: AxisPivotActionExecutorPort<AxisPivotRetryActionResult>
  'self-repair': AxisPivotActionExecutorPort<
    AxisPivotSelfRepairActionResult
  >
  stop: AxisPivotActionExecutorPort<AxisPivotStopActionResult>
}

export interface AxisPivotActionDispatcherPort {
  dispatch(request: AxisPivotDispatchRequest): Promise<AxisPivotDispatchResult>
}
