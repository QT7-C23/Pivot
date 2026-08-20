import { z } from 'zod'
import {
  AxisPlanLineageSchema,
  AxisRunLifecycleEventSchema,
  EngineStopReasonSchema,
} from './axis-engine-contracts'
import {
  AxisSelfRepairAssignmentSchema,
} from './axis-worker-attempt-contracts'
import {
  AxisDedicatedFixerAssignmentSchema,
} from './axis-dedicated-fixer-contracts'
import {
  AxisWorkerDiscardReceiptSchema,
} from './axis-worker-discard-contracts'
import {
  AxisHumanEscalationReceiptSchema,
} from './axis-human-escalation-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)

export const AxisPivotReplanActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPivotReplanActionResultSchema = z.object({
  action: z.literal('replan'),
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  lineage: AxisPlanLineageSchema,
  outcome: z.enum(['created', 'already-completed']),
  parentRunId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  if (result.lineage.status !== 'completed') {
    context.addIssue({
      code: 'custom',
      message: 'Pivot replan action requires a completed lineage',
      path: ['lineage', 'status'],
    })
  }
  if (result.lineage.parentRunId !== result.parentRunId) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot replan lineage parent must match the action parent Run',
      path: ['lineage', 'parentRunId'],
    })
  }
  if (result.lineage.sessionId !== result.sessionId) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot replan lineage Session must match the action Session',
      path: ['lineage', 'sessionId'],
    })
  }
  if (result.lineage.sourceRevision !== result.executionRevision) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot replan lineage source revision must match the action execution revision',
      path: ['lineage', 'sourceRevision'],
    })
  }
  if (!result.lineage.childRunId) {
    context.addIssue({
      code: 'custom',
      message: 'Completed Pivot replan lineage requires a child Run',
      path: ['lineage', 'childRunId'],
    })
  }
})

export const AxisPivotRetryActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPivotRetryActionResultSchema = z.object({
  action: z.literal('retry'),
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  event: AxisRunLifecycleEventSchema,
  executionRevision: z.number().int().positive(),
  outcome: z.enum(['scheduled', 'already-scheduled']),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  stateRevision: z.number().int().positive(),
  taskId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  if (result.stateRevision !== result.executionRevision + 1) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot retry state revision must immediately follow its execution revision',
      path: ['stateRevision'],
    })
  }
  if (
    result.event.type !== 'pivot-retry-scheduled'
    || result.event.pivotDecisionId !== result.decisionId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot retry event must match its decision',
      path: ['event', 'pivotDecisionId'],
    })
  }
  if (
    result.event.revision !== result.stateRevision
    || result.event.taskId !== result.taskId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot retry event must match its state revision and task',
      path: ['event'],
    })
  }
})

export const AxisPivotSelfRepairActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

const AxisPivotSelfRepairActionResultV1Schema = z.object({
  action: z.literal('self-repair'),
  assignment: AxisSelfRepairAssignmentSchema,
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  outcome: z.enum(['assigned', 'already-assigned']),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
  workerId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  const assignment = result.assignment
  const ownershipMatches = (
    assignment.decisionId === result.decisionId
    && assignment.executionRevision === result.executionRevision
    && assignment.runId === result.runId
    && assignment.sessionId === result.sessionId
    && assignment.taskId === result.taskId
  )
  if (!ownershipMatches) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot self-repair assignment decision, Run, Session, revision, and task must match its action result',
      path: ['assignment'],
    })
  }
  if (assignment.workerId !== result.workerId) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot self-repair assignment Worker must match its action result',
      path: ['assignment', 'workerId'],
    })
  }
})

const AxisPivotSelfRepairActionResultV2Schema = z.object({
  action: z.literal('self-repair'),
  assignment: AxisSelfRepairAssignmentSchema,
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  event: AxisRunLifecycleEventSchema,
  executionRevision: z.number().int().positive(),
  outcome: z.enum(['assigned', 'already-assigned']),
  runId: IdentifierSchema,
  scheduleOutcome: z.enum(['scheduled', 'already-scheduled']),
  schemaVersion: z.literal(2),
  sessionId: IdentifierSchema,
  stateRevision: z.number().int().positive(),
  taskId: IdentifierSchema,
  workerId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  const assignment = result.assignment
  if (
    assignment.decisionId !== result.decisionId
    || assignment.executionRevision !== result.executionRevision
    || assignment.runId !== result.runId
    || assignment.sessionId !== result.sessionId
    || assignment.taskId !== result.taskId
    || assignment.workerId !== result.workerId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot self-repair assignment must match its scheduled action ownership',
      path: ['assignment'],
    })
  }
  if (
    result.stateRevision !== result.executionRevision + 1
    || result.event.type !== 'pivot-self-repair-scheduled'
    || result.event.pivotDecisionId !== result.decisionId
    || result.event.revision !== result.stateRevision
    || result.event.taskId !== result.taskId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot self-repair schedule event must match its decision, revision, and task',
      path: ['event'],
    })
  }
})

export const AxisPivotSelfRepairActionResultSchema = z.discriminatedUnion(
  'schemaVersion',
  [
    AxisPivotSelfRepairActionResultV1Schema,
    AxisPivotSelfRepairActionResultV2Schema,
  ],
)

export const AxisPivotDedicatedFixerActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

const AxisPivotDedicatedFixerActionResultV1Schema = z.object({
  action: z.literal('dedicated-fixer'),
  assignment: AxisDedicatedFixerAssignmentSchema,
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  fixerId: IdentifierSchema,
  outcome: z.enum(['assigned', 'already-assigned']),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  const assignment = result.assignment
  if (
    assignment.decisionId !== result.decisionId
    || assignment.executionRevision !== result.executionRevision
    || assignment.runId !== result.runId
    || assignment.sessionId !== result.sessionId
    || assignment.taskId !== result.taskId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot dedicated Fixer assignment decision, Run, Session, revision, and task must match its action result',
      path: ['assignment'],
    })
  }
  if (assignment.fixer.fixerId !== result.fixerId) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot dedicated Fixer assignment identity must match its action result',
      path: ['assignment', 'fixer', 'fixerId'],
    })
  }
})

const AxisPivotDedicatedFixerActionResultV2Schema = z.object({
  action: z.literal('dedicated-fixer'),
  assignment: AxisDedicatedFixerAssignmentSchema,
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  event: AxisRunLifecycleEventSchema,
  executionRevision: z.number().int().positive(),
  fixerId: IdentifierSchema,
  outcome: z.enum(['assigned', 'already-assigned']),
  runId: IdentifierSchema,
  scheduleOutcome: z.enum(['scheduled', 'already-scheduled']),
  schemaVersion: z.literal(2),
  sessionId: IdentifierSchema,
  stateRevision: z.number().int().positive(),
  taskId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  const assignment = result.assignment
  if (
    assignment.decisionId !== result.decisionId
    || assignment.executionRevision !== result.executionRevision
    || assignment.runId !== result.runId
    || assignment.sessionId !== result.sessionId
    || assignment.taskId !== result.taskId
    || assignment.fixer.fixerId !== result.fixerId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot dedicated Fixer assignment must match its scheduled action ownership',
      path: ['assignment'],
    })
  }
  if (
    result.stateRevision !== result.executionRevision + 1
    || result.event.type !== 'pivot-dedicated-fixer-scheduled'
    || result.event.pivotDecisionId !== result.decisionId
    || result.event.revision !== result.stateRevision
    || result.event.taskId !== result.taskId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot dedicated Fixer schedule event must match its decision, revision, and task',
      path: ['event'],
    })
  }
})

export const AxisPivotDedicatedFixerActionResultSchema = z.discriminatedUnion(
  'schemaVersion',
  [
    AxisPivotDedicatedFixerActionResultV1Schema,
    AxisPivotDedicatedFixerActionResultV2Schema,
  ],
)

export const AxisPivotDiscardActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPivotDiscardActionResultSchema = z.object({
  action: z.literal('discard'),
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  outcome: z.enum(['discarded', 'already-discarded']),
  receipt: AxisWorkerDiscardReceiptSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
  workerId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  const receipt = result.receipt
  if (
    receipt.decisionId !== result.decisionId
    || receipt.executionRevision !== result.executionRevision
    || receipt.runId !== result.runId
    || receipt.sessionId !== result.sessionId
    || receipt.taskId !== result.taskId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot discard receipt decision, Run, Session, revision, and task must match its action result',
      path: ['receipt'],
    })
  }
  if (receipt.sourceWorkerId !== result.workerId) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot discard receipt Worker must match its action result',
      path: ['receipt', 'sourceWorkerId'],
    })
  }
})

export const AxisPivotEscalateActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPivotEscalateActionResultSchema = z.object({
  action: z.literal('escalate'),
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  outcome: z.enum(['opened', 'already-open']),
  receipt: AxisHumanEscalationReceiptSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema.nullable(),
}).strict().superRefine((result, context) => {
  const receipt = result.receipt
  if (
    receipt.decisionId !== result.decisionId
    || receipt.executionRevision !== result.executionRevision
    || receipt.runId !== result.runId
    || receipt.sessionId !== result.sessionId
    || receipt.taskId !== result.taskId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot escalation receipt decision, Run, Session, revision, and task must match its action result',
      path: ['receipt'],
    })
  }
})

export const AxisPivotStopActionRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPivotStopActionResultSchema = z.object({
  action: z.literal('stop'),
  authority: z.literal('pivot-main'),
  decisionId: IdentifierSchema,
  event: AxisRunLifecycleEventSchema,
  executionRevision: z.number().int().positive(),
  forced: z.boolean(),
  outcome: z.enum(['stopped', 'already-stopped']),
  reason: z.string().trim().min(1).max(4_000),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  stateRevision: z.number().int().positive(),
  stopReason: EngineStopReasonSchema.nullable(),
  taskId: IdentifierSchema.nullable(),
}).strict().superRefine((result, context) => {
  if (result.stateRevision !== result.executionRevision + 1) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot stop state revision must immediately follow its execution revision',
      path: ['stateRevision'],
    })
  }
  if (
    result.event.type !== 'pivot-stopped'
    || result.event.pivotDecisionId !== result.decisionId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot stop event must match its decision',
      path: ['event', 'pivotDecisionId'],
    })
  }
  if (
    result.event.revision !== result.stateRevision
    || result.event.taskId !== result.taskId
    || result.event.detail !== result.reason
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot stop event must match its state revision, task, and reason',
      path: ['event'],
    })
  }
  if (result.forced !== Boolean(result.stopReason)) {
    context.addIssue({
      code: 'custom',
      message: 'Forced Pivot stop evidence must match its budget stop reason',
      path: ['forced'],
    })
  }
})

export const AxisPivotDispatchRequestSchema = z.object({
  decisionId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPivotContinuationActionResultSchema = z.union([
  AxisPivotReplanActionResultSchema,
  AxisPivotRetryActionResultSchema,
  AxisPivotSelfRepairActionResultSchema,
  AxisPivotDedicatedFixerActionResultSchema,
])

export const AxisPivotTerminalActionResultSchema = z.union([
  AxisPivotDiscardActionResultSchema,
  AxisPivotEscalateActionResultSchema,
  AxisPivotStopActionResultSchema,
])

export const AxisPivotActionResultSchema = z.union([
  AxisPivotContinuationActionResultSchema,
  AxisPivotTerminalActionResultSchema,
])

export const AxisPivotDispatchResultSchema = z.object({
  authority: z.literal('pivot-main-dispatcher'),
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  result: AxisPivotActionResultSchema,
  route: z.enum(['continuation', 'terminal']),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
}).strict().superRefine((dispatch, context) => {
  const result = dispatch.result
  const resultRunId = result.action === 'replan'
    ? result.parentRunId
    : result.runId
  if (
    result.decisionId !== dispatch.decisionId
    || result.executionRevision !== dispatch.executionRevision
    || resultRunId !== dispatch.runId
    || result.sessionId !== dispatch.sessionId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot dispatch result must match its decision, revision, Run, and Session',
      path: ['result'],
    })
  }
  const continuation = (
    result.action === 'replan'
    || result.action === 'retry'
    || result.action === 'self-repair'
    || result.action === 'dedicated-fixer'
  )
  if ((continuation ? 'continuation' : 'terminal') !== dispatch.route) {
    context.addIssue({
      code: 'custom',
      message: 'Pivot dispatch route must match its action category',
      path: ['route'],
    })
  }
})

export type AxisPivotReplanActionRequest = z.infer<
  typeof AxisPivotReplanActionRequestSchema
>
export type AxisPivotReplanActionResult = z.infer<
  typeof AxisPivotReplanActionResultSchema
>
export type AxisPivotRetryActionRequest = z.infer<
  typeof AxisPivotRetryActionRequestSchema
>
export type AxisPivotRetryActionResult = z.infer<
  typeof AxisPivotRetryActionResultSchema
>
export type AxisPivotSelfRepairActionRequest = z.infer<
  typeof AxisPivotSelfRepairActionRequestSchema
>
export type AxisPivotSelfRepairActionResult = z.infer<
  typeof AxisPivotSelfRepairActionResultSchema
>
export type AxisPivotDedicatedFixerActionRequest = z.infer<
  typeof AxisPivotDedicatedFixerActionRequestSchema
>
export type AxisPivotDedicatedFixerActionResult = z.infer<
  typeof AxisPivotDedicatedFixerActionResultSchema
>
export type AxisPivotDiscardActionRequest = z.infer<
  typeof AxisPivotDiscardActionRequestSchema
>
export type AxisPivotDiscardActionResult = z.infer<
  typeof AxisPivotDiscardActionResultSchema
>
export type AxisPivotEscalateActionRequest = z.infer<
  typeof AxisPivotEscalateActionRequestSchema
>
export type AxisPivotEscalateActionResult = z.infer<
  typeof AxisPivotEscalateActionResultSchema
>
export type AxisPivotStopActionRequest = z.infer<
  typeof AxisPivotStopActionRequestSchema
>
export type AxisPivotStopActionResult = z.infer<
  typeof AxisPivotStopActionResultSchema
>
export type AxisPivotDispatchRequest = z.infer<
  typeof AxisPivotDispatchRequestSchema
>
export type AxisPivotContinuationActionResult = z.infer<
  typeof AxisPivotContinuationActionResultSchema
>
export type AxisPivotTerminalActionResult = z.infer<
  typeof AxisPivotTerminalActionResultSchema
>
export type AxisPivotActionResult = z.infer<
  typeof AxisPivotActionResultSchema
>
export type AxisPivotDispatchResult = z.infer<
  typeof AxisPivotDispatchResultSchema
>
