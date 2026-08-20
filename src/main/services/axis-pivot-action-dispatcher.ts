import {
  AxisPivotDecisionRecordSchema,
  type AxisPivotAction,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotDispatchRequestSchema,
  AxisPivotDispatchResultSchema,
  type AxisPivotActionResult,
  type AxisPivotDispatchRequest,
  type AxisPivotDispatchResult,
} from '../../shared/axis-pivot-action-contracts'
import type {
  AxisPivotDecisionReaderPort,
} from './axis-pivot-action-ports'
import type {
  AxisPivotActionDispatcherPort,
  AxisPivotActionExecutorPort,
  AxisPivotActionExecutorSet,
} from './axis-pivot-dispatch-ports'

const CONTINUATION_ACTIONS = new Set<AxisPivotAction>([
  'dedicated-fixer',
  'replan',
  'retry',
  'self-repair',
])

export class AxisPivotActionDispatcher
implements AxisPivotActionDispatcherPort {
  private readonly decisions: AxisPivotDecisionReaderPort
  private readonly executors: AxisPivotActionExecutorSet

  constructor(options: {
    decisions: AxisPivotDecisionReaderPort
    executors: AxisPivotActionExecutorSet
  }) {
    this.decisions = options.decisions
    this.executors = Object.freeze({ ...options.executors })
  }

  async dispatch(
    requestInput: AxisPivotDispatchRequest,
  ): Promise<AxisPivotDispatchResult> {
    const request = AxisPivotDispatchRequestSchema.parse(requestInput)
    const found = this.decisions.find(request.decisionId)
    if (!found) {
      throw new Error(
        `Axis Pivot dispatch decision not found: ${request.decisionId}`,
      )
    }
    const parsed = AxisPivotDecisionRecordSchema.safeParse(found)
    if (!parsed.success) {
      throw new Error(
        `Axis Pivot dispatch decision failed strict validation: ${parsed.error.message}`,
      )
    }
    const record = parsed.data
    if (
      record.decisionId !== request.decisionId
      || record.runId !== request.runId
      || record.sessionId !== request.sessionId
    ) {
      throw new Error(
        'Axis Pivot dispatch request ownership does not match its decision',
      )
    }
    if (record.status !== 'decided' || !record.decision) {
      throw new Error(
        `Axis Pivot dispatch requires a decided record: ${record.status}`,
      )
    }
    if (request.expectedRevision !== record.sourceRevision + 1) {
      throw new Error(
        `Axis Pivot dispatch revision conflict: expected ${request.expectedRevision}, decision ${record.sourceRevision + 1}`,
      )
    }

    const action = record.decision.action
    const executor = this.executors[action] as AxisPivotActionExecutorPort<
      AxisPivotActionResult
    >
    const result = await executor.execute(request)
    if (result.action !== action) {
      throw new Error(
        `Axis Pivot action Port returned ${result.action} for committed ${action} action`,
      )
    }
    return AxisPivotDispatchResultSchema.parse({
      authority: 'pivot-main-dispatcher',
      decisionId: record.decisionId,
      executionRevision: request.expectedRevision,
      result,
      route: CONTINUATION_ACTIONS.has(action)
        ? 'continuation'
        : 'terminal',
      runId: record.runId,
      schemaVersion: 1,
      sessionId: record.sessionId,
    })
  }
}
