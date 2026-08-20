import type {
  AxisPivotDecisionReaderPort,
} from './axis-pivot-action-ports'
import { AxisPivotActionDispatcher } from './axis-pivot-action-dispatcher'
import type {
  AxisPivotActionDispatcherPort,
  AxisPivotActionExecutorSet,
} from './axis-pivot-dispatch-ports'

export function composeAxisPivotActionDispatcher(options: {
  decisions: AxisPivotDecisionReaderPort
  executors: AxisPivotActionExecutorSet
}): AxisPivotActionDispatcherPort {
  const dispatcher = new AxisPivotActionDispatcher(options)
  return Object.freeze({
    dispatch: (request: AxisPivotDispatchRequest) => (
      dispatcher.dispatch(request)
    ),
  })
}
import type {
  AxisPivotDispatchRequest,
} from '../../shared/axis-pivot-action-contracts'
