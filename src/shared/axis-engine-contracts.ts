import { z } from 'zod'
import { AxisFileFingerprintEvidenceSchema } from './axis-file-fingerprint-contracts'
import { AxisFileLeaseSchema } from './axis-file-lease-contracts'
import {
  AxisCheckpointReceiptSchema,
  AxisExecutionGrantSchema,
  AxisCheckpointReceiptBatchSchema,
  AxisRollbackOwnerSchema,
  AxisExecutionAuthorityEnvelopeSchema,
  AxisMutationIntentSchema,
  AxisSafeWriteIntentSchema,
  AxisFakeMutationReceiptSchema,
  AxisSafeWriteReceiptSchema,
  AxisRollbackOutcomeSchema,
  AxisExecutionTransactionSchema,
  AxisGuardedSafeWriteCompletionEvidenceSchema,
  AxisGuardedExecutionResultSchema,
  AxisGuardedSafeWriteResultSchema,
  AxisAuthorityAuditEntrySchema,
} from './axis-execution-contracts'

export {
  AxisCheckpointReceiptSchema,
  AxisExecutionGrantSchema,
  AxisCheckpointReceiptBatchSchema,
  AxisRollbackOwnerSchema,
  AxisExecutionAuthorityEnvelopeSchema,
  AxisMutationIntentSchema,
  AxisSafeWriteIntentSchema,
  AxisFakeMutationReceiptSchema,
  AxisSafeWriteReceiptSchema,
  AxisRollbackOutcomeSchema,
  AxisExecutionTransactionSchema,
  AxisGuardedSafeWriteCompletionEvidenceSchema,
  AxisGuardedExecutionResultSchema,
  AxisGuardedSafeWriteResultSchema,
  AxisAuthorityAuditEntrySchema,
} from './axis-execution-contracts'
import {
  AxisGateBatchResultSchema,
  AxisGateRunEvidenceSchema,
  GateResultSchema,
} from './axis-gate-contracts'

export {
  AxisGateBatchResultSchema,
  AxisGateRunEvidenceSchema,
  GateResultSchema,
} from './axis-gate-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp')
const NonNegativeFiniteSchema = z.number().finite().nonnegative()

export const AxisRiskFlagSchema = z.enum([
  'cross-module',
  'destructive',
  'security-sensitive',
  'high-context',
  'external-runtime',
])

export const AxisClassificationGateSchema = z.enum([
  'compile',
  'test',
  'lint',
  'correctness',
  'security',
])

export const AxisClassificationProposalSchema = z.object({
  confidence: z.number().finite().min(0).max(1),
  reasons: z.array(z.string().trim().min(1)).min(1).max(12),
  riskFlags: z.array(AxisRiskFlagSchema).max(5),
  route: z.enum(['single-agent', 'multi-agent']),
  score: z.number().int().min(1).max(5),
  suggestedWorkers: z.number().int().min(1).max(8),
}).strict().superRefine((report, context) => {
  if (report.route === 'single-agent' && report.suggestedWorkers !== 1) {
    context.addIssue({ code: 'custom', message: 'Single-agent routes must use exactly one worker', path: ['suggestedWorkers'] })
  }
  if (report.route === 'multi-agent' && report.suggestedWorkers < 2) {
    context.addIssue({ code: 'custom', message: 'Multi-agent routes require at least two workers', path: ['suggestedWorkers'] })
  }
})

export const AxisClassificationPolicyAdjustmentSchema = z.enum([
  'score-raised-for-cross-module',
  'score-raised-for-destructive',
  'score-raised-for-security-sensitive',
  'score-raised-for-high-context',
  'score-raised-for-external-runtime',
  'low-confidence-human-review-required',
  'low-confidence-fan-out-disabled',
  'risk-human-review-required',
  'legacy-plan-migrated-conservatively',
])

export const ComplexityReportSchema = AxisClassificationProposalSchema.extend({
  policyAdjustments: z.array(AxisClassificationPolicyAdjustmentSchema).max(8),
  requiredGates: z.array(AxisClassificationGateSchema).min(2).max(5),
  requiresHumanReview: z.boolean(),
  schemaVersion: z.literal(1),
}).strict().superRefine((report, context) => {
  if (report.requiredGates[0] !== 'compile' || report.requiredGates[1] !== 'test') {
    context.addIssue({ code: 'custom', message: 'Axis classification must begin with compile and test gates', path: ['requiredGates'] })
  }
  if (new Set(report.requiredGates).size !== report.requiredGates.length) {
    context.addIssue({ code: 'custom', message: 'Axis classification gates must be unique', path: ['requiredGates'] })
  }
  if (new Set(report.riskFlags).size !== report.riskFlags.length) {
    context.addIssue({ code: 'custom', message: 'Axis classification risk flags must be unique', path: ['riskFlags'] })
  }
  if (new Set(report.policyAdjustments).size !== report.policyAdjustments.length) {
    context.addIssue({ code: 'custom', message: 'Axis classification policy adjustments must be unique', path: ['policyAdjustments'] })
  }
  if (report.riskFlags.includes('security-sensitive') && (!report.requiredGates.includes('security') || !report.requiresHumanReview || report.score < 4)) {
    context.addIssue({ code: 'custom', message: 'Security-sensitive classification requires score 4, security Gate and human review' })
  }
  const riskFloor = report.riskFlags.reduce((floor, risk) => Math.max(
    floor,
    risk === 'cross-module' || risk === 'high-context' ? 3 : 4,
  ), 1)
  if (report.score < riskFloor) {
    context.addIssue({ code: 'custom', message: 'Axis classification score is below its risk floor', path: ['score'] })
  }
  if (
    report.riskFlags.some((risk) => risk === 'destructive' || risk === 'external-runtime')
    && !report.requiresHumanReview
  ) {
    context.addIssue({ code: 'custom', message: 'Destructive and external-runtime classifications require human review', path: ['requiresHumanReview'] })
  }
  if (report.confidence < 0.7 && (report.route !== 'single-agent' || report.suggestedWorkers !== 1 || !report.requiresHumanReview || report.score < 4)) {
    context.addIssue({ code: 'custom', message: 'Low-confidence classification must fail closed to one reviewed worker' })
  }
})

export const AxisPlanningContextSchema = z.object({
  availableFiles: z.array(z.string().trim().min(1).max(1_024)).max(2_000),
  constraints: z.array(z.string().trim().min(1).max(2_000)).max(64),
}).strict()

export const AxisModelUsageSchema = z.object({
  costUsd: NonNegativeFiniteSchema,
  tokens: z.number().int().nonnegative(),
}).strict()

export const AxisTaskProposalSchema = z.object({
  assignedFiles: z.array(z.string().trim().min(1)).max(256),
  dependencies: z.array(IdentifierSchema).max(128),
  estimatedComplexity: z.number().int().min(1).max(5),
  id: IdentifierSchema,
  objective: z.string().trim().min(1).max(8_000),
  requiredTools: z.array(IdentifierSchema).max(64),
  // v1.0 is a one-layer DAG: the orchestrator may spawn workers, workers may not spawn workers.
  spawnDepth: z.literal(1),
  title: z.string().trim().min(1).max(240),
}).strict()

export const AxisTaskSchema = AxisTaskProposalSchema.extend({
  requiredGates: z.array(AxisClassificationGateSchema).min(2).max(5),
  requiresHumanReview: z.boolean(),
}).strict().superRefine((task, context) => {
  if (task.requiredGates[0] !== 'compile' || task.requiredGates[1] !== 'test') {
    context.addIssue({ code: 'custom', message: 'Axis task gates must begin with compile and test', path: ['requiredGates'] })
  }
  if (new Set(task.requiredGates).size !== task.requiredGates.length) {
    context.addIssue({ code: 'custom', message: 'Axis task gates must be unique', path: ['requiredGates'] })
  }
})

const TaskDagBaseSchema = z.object({
  createdAt: TimestampSchema,
  dagId: IdentifierSchema,
  objective: z.string().trim().min(1).max(8_000),
  schemaVersion: z.literal(1),
})

export const TaskDagProposalSchema = TaskDagBaseSchema.extend({
  tasks: z.array(AxisTaskProposalSchema).min(1).max(128),
}).strict()

export const TaskDagSchema = TaskDagBaseSchema.extend({
  tasks: z.array(AxisTaskSchema).min(1).max(128),
}).strict()

export const BudgetEnvelopeSchema = z.object({
  maxCostUsd: z.number().finite().positive(),
  maxDurationMs: z.number().int().positive(),
  maxGateCyclesPerFile: z.number().int().min(1).max(20),
  maxPivots: z.number().int().min(0).max(20),
  maxRetriesPerTask: z.number().int().min(0).max(10),
  maxTokens: z.number().int().positive(),
  maxWorkers: z.number().int().min(1).max(8),
}).strict()

export const AxisShadowRunRequestSchema = z.object({
  budget: BudgetEnvelopeSchema,
  context: AxisPlanningContextSchema,
  objective: z.string().trim().min(1).max(8_000),
  sessionId: IdentifierSchema,
}).strict()

export const AxisShadowPlanRequestSchema = AxisShadowRunRequestSchema.omit({ context: true })

export const AxisShadowStateSchema = z.object({
  available: z.boolean(),
  enabled: z.boolean(),
  reason: z.enum(['disabled', 'no-active-provider', 'provider-key-unavailable']).nullable(),
}).strict()

export const EngineBudgetUsageSchema = z.object({
  costUsd: NonNegativeFiniteSchema,
  durationMs: z.number().int().nonnegative(),
  gateCyclesForFile: z.number().int().nonnegative(),
  pivots: z.number().int().nonnegative(),
  retriesForTask: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
}).strict()

export const WorkerResultSchema = z.object({
  artifacts: z.array(z.object({ id: IdentifierSchema, path: z.string().trim().min(1), type: z.string().trim().min(1) }).strict()).max(256),
  findings: z.array(z.string()).max(256),
  status: z.enum(['completed', 'failed', 'cancelled']),
  summary: z.string().max(16_000),
  taskId: IdentifierSchema,
  usage: EngineBudgetUsageSchema.pick({ costUsd: true, durationMs: true, tokens: true }),
}).strict()

export const AxisPermissionEvaluationSchema = z.object({
  authority: z.literal('simulation'),
  evidence: z.array(z.string().trim().min(1).max(2_000)).min(1).max(64),
  requestedTools: z.array(IdentifierSchema).max(64),
  status: z.enum(['allowed', 'denied']),
  taskId: IdentifierSchema,
}).strict().superRefine((evaluation, context) => {
  if (new Set(evaluation.requestedTools).size !== evaluation.requestedTools.length) {
    context.addIssue({ code: 'custom', message: 'Requested tool identifiers must be unique', path: ['requestedTools'] })
  }
})

export const AxisCheckpointEvaluationSchema = z.object({
  authority: z.literal('simulation'),
  checkpointIds: z.array(IdentifierSchema).max(256),
  evidence: z.array(z.string().trim().min(1).max(2_000)).min(1).max(64),
  filePaths: z.array(z.string().trim().min(1).max(1_024)).max(256),
  status: z.enum(['ready', 'failed', 'skipped']),
  taskId: IdentifierSchema,
}).strict().superRefine((evaluation, context) => {
  if (evaluation.status === 'skipped' && evaluation.checkpointIds.length > 0) {
    context.addIssue({ code: 'custom', message: 'Skipped checkpoint evaluations cannot contain checkpoint identifiers', path: ['checkpointIds'] })
  }
  if (new Set(evaluation.filePaths).size !== evaluation.filePaths.length) {
    context.addIssue({ code: 'custom', message: 'Checkpoint file paths must be unique', path: ['filePaths'] })
  }
})

export const AxisReviewEvaluationSchema = z.object({
  authority: z.literal('simulation'),
  gates: z.array(GateResultSchema).min(1).max(16),
  status: z.enum(['passed', 'failed']),
  summary: z.string().trim().min(1).max(4_000),
  taskId: IdentifierSchema,
}).strict().superRefine((evaluation, context) => {
  evaluation.gates.forEach((gate, index) => {
    if (gate.taskId !== evaluation.taskId) {
      context.addIssue({ code: 'custom', message: 'Reviewer Gate task identifiers must match the aggregate task', path: ['gates', index, 'taskId'] })
    }
  })
  const derivedStatus = evaluation.gates.every((gate) => gate.status === 'passed') ? 'passed' : 'failed'
  if (evaluation.status !== derivedStatus) {
    context.addIssue({ code: 'custom', message: 'Review status must match Reviewer Gate evidence', path: ['status'] })
  }
})

export const EngineStopReasonSchema = z.enum([
  'token-limit', 'cost-limit', 'time-limit', 'retry-limit', 'gate-cycle-limit', 'pivot-limit',
])

export const AxisPivotActionSchema = z.enum([
  'self-repair',
  'retry',
  'replan',
  'dedicated-fixer',
  'discard',
  'escalate',
  'stop',
])

export const PivotDecisionSchema = z.object({
  action: AxisPivotActionSchema,
  reason: z.string().trim().min(1).max(4_000),
  taskId: IdentifierSchema.nullable(),
}).strict()

export const AxisPivotTriggerSchema = z.object({
  category: z.enum(['minor', 'direction', 'design', 'security', 'excessive']),
  evidenceIds: z.array(IdentifierSchema).min(1).max(64),
  summary: z.string().trim().min(1).max(4_000),
  taskId: IdentifierSchema.nullable(),
}).strict().superRefine((trigger, context) => {
  if (new Set(trigger.evidenceIds).size !== trigger.evidenceIds.length) {
    context.addIssue({ code: 'custom', message: 'Pivot trigger evidence identifiers must be unique', path: ['evidenceIds'] })
  }
})

export const AxisRemainingBudgetSchema = z.object({
  costUsd: NonNegativeFiniteSchema,
  durationMs: z.number().int().nonnegative(),
  gateCyclesForFile: z.number().int().nonnegative(),
  pivots: z.number().int().nonnegative(),
  retriesForTask: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
}).strict()

export const AxisPivotRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  trigger: AxisPivotTriggerSchema,
}).strict()

export const AxisPivotDecisionRecordSchema = z.object({
  allowedActions: z.array(AxisPivotActionSchema).min(1).max(7),
  budget: BudgetEnvelopeSchema,
  createdAt: TimestampSchema,
  decision: PivotDecisionSchema.nullable(),
  decisionDurationMs: z.number().int().nonnegative(),
  decisionId: IdentifierSchema,
  error: z.string().trim().min(1).max(16_000).nullable(),
  forced: z.boolean(),
  modelUsage: AxisModelUsageSchema,
  objective: z.string().trim().min(1).max(8_000),
  proposal: PivotDecisionSchema.nullable(),
  remainingBudget: AxisRemainingBudgetSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  sessionId: IdentifierSchema,
  sourceRevision: z.number().int().positive(),
  sourceStatus: z.enum(['failed', 'paused']),
  status: z.enum(['deciding', 'committing', 'decided', 'failed', 'stale', 'interrupted']),
  stopReason: EngineStopReasonSchema.nullable(),
  trigger: AxisPivotTriggerSchema,
  updatedAt: TimestampSchema,
  usageBefore: EngineBudgetUsageSchema,
}).strict().superRefine((record, context) => {
  if (new Set(record.allowedActions).size !== record.allowedActions.length) {
    context.addIssue({ code: 'custom', message: 'Pivot allowed actions must be unique', path: ['allowedActions'] })
  }
  if (!record.allowedActions.includes('stop')) {
    context.addIssue({ code: 'custom', message: 'Pivot allowed actions must always include stop', path: ['allowedActions'] })
  }
  const expectedRemaining = {
    costUsd: Math.max(0, record.budget.maxCostUsd - record.usageBefore.costUsd),
    durationMs: Math.max(0, record.budget.maxDurationMs - record.usageBefore.durationMs),
    gateCyclesForFile: Math.max(0, record.budget.maxGateCyclesPerFile - record.usageBefore.gateCyclesForFile),
    pivots: Math.max(0, record.budget.maxPivots - record.usageBefore.pivots),
    retriesForTask: Math.max(0, record.budget.maxRetriesPerTask - record.usageBefore.retriesForTask),
    tokens: Math.max(0, record.budget.maxTokens - record.usageBefore.tokens),
  }
  if (JSON.stringify(record.remainingBudget) !== JSON.stringify(expectedRemaining)) {
    context.addIssue({ code: 'custom', message: 'Pivot remaining budget must match its immutable budget snapshot', path: ['remainingBudget'] })
  }
  for (const [field, decision] of [['proposal', record.proposal], ['decision', record.decision]] as const) {
    if (decision && decision.taskId !== record.trigger.taskId) {
      context.addIssue({ code: 'custom', message: 'Pivot decision task must match its trigger', path: [field, 'taskId'] })
    }
  }
  if (record.decision && !record.allowedActions.includes(record.decision.action)) {
    context.addIssue({ code: 'custom', message: 'Committed Pivot decision must be an allowed action', path: ['decision', 'action'] })
  }
  if (record.status === 'deciding' && (record.proposal || record.decision || record.error)) {
    context.addIssue({ code: 'custom', message: 'Deciding Pivot records cannot contain a result or error' })
  }
  if ((record.status === 'committing' || record.status === 'decided') && (!record.decision || record.error)) {
    context.addIssue({ code: 'custom', message: 'Committing and decided Pivot records require a decision without an error' })
  }
  const needsError = record.status === 'failed' || record.status === 'stale' || record.status === 'interrupted'
  if (needsError !== Boolean(record.error)) {
    context.addIssue({ code: 'custom', message: 'Pivot record error must match its failure status', path: ['error'] })
  }
  if (record.forced && (record.decision?.action !== 'stop' || !record.stopReason)) {
    context.addIssue({ code: 'custom', message: 'Forced Pivot decisions require a budget stop reason', path: ['forced'] })
  }
  if (!record.forced && record.stopReason) {
    context.addIssue({ code: 'custom', message: 'Non-forced Pivot decisions cannot contain a budget stop reason', path: ['stopReason'] })
  }
})

export const EngineTraceEventSchema = z.object({
  detail: z.string().max(16_000),
  sequence: z.number().int().positive(),
  taskId: IdentifierSchema.nullable(),
  timestamp: TimestampSchema,
  type: z.enum([
    'run-started', 'complexity-evaluated', 'dag-created', 'task-scheduled', 'task-started', 'task-completed', 'task-failed',
    'gate-completed', 'pivot-decided', 'budget-stopped', 'run-completed', 'run-failed',
  ]),
}).strict()

export const EngineTraceSchema = z.object({
  events: z.array(EngineTraceEventSchema).max(20_000),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  startedAt: TimestampSchema,
  traceId: IdentifierSchema,
}).strict().superRefine((trace, context) => {
  for (let index = 0; index < trace.events.length; index += 1) {
    if (trace.events[index]!.sequence !== index + 1) {
      context.addIssue({
        code: 'custom',
        message: 'Trace event sequence must be contiguous and start at 1',
        path: ['events', index, 'sequence'],
      })
    }
  }
})

export const AxisDagScheduleSchema = z.object({
  batches: z.array(z.array(IdentifierSchema).min(1)).min(1),
  orderedTaskIds: z.array(IdentifierSchema).min(1),
  warnings: z.array(z.enum(['serial-collapse-risk'])),
}).strict()

export const AxisShadowRunResultSchema = z.object({
  complexity: ComplexityReportSchema.nullable(),
  dag: TaskDagSchema.nullable(),
  mode: z.literal('shadow'),
  objective: z.string().trim().min(1).max(8_000),
  schedule: AxisDagScheduleSchema.nullable(),
  status: z.enum(['planned', 'stopped']),
  stopReason: EngineStopReasonSchema.nullable(),
  trace: EngineTraceSchema,
  usage: EngineBudgetUsageSchema,
}).strict().superRefine((result, context) => {
  if (result.status === 'planned' && (!result.complexity || !result.dag || !result.schedule || result.stopReason)) {
    context.addIssue({ code: 'custom', message: 'Planned shadow runs require complexity, DAG, schedule, and no stop reason' })
  }
  if (result.status === 'stopped' && !result.stopReason) {
    context.addIssue({ code: 'custom', message: 'Stopped shadow runs require an explicit stop reason', path: ['stopReason'] })
  }
})

export const AxisTaskRunStateSchema = z.object({
  attempts: z.number().int().nonnegative(),
  error: z.string().trim().min(1).max(16_000).nullable(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  taskId: IdentifierSchema,
  updatedAt: TimestampSchema,
  usage: EngineBudgetUsageSchema,
}).strict()

export const AxisRunLifecycleEventSchema = z.object({
  detail: z.string().max(4_000).default(''),
  pivotDecisionId: IdentifierSchema.optional(),
  revision: z.number().int().positive(),
  taskId: IdentifierSchema.nullable().default(null),
  timestamp: TimestampSchema,
  type: z.enum([
    'initialized', 'cancelled', 'restarted', 'dry-run-started', 'guarded-execution-started', 'task-started', 'task-completed',
    'task-failed', 'task-cancelled', 'task-updated', 'permission-allowed', 'permission-denied',
    'checkpoint-ready', 'checkpoint-failed', 'checkpoint-skipped', 'review-passed', 'review-failed',
    'retry-scheduled', 'pivot-decided', 'pivot-retry-scheduled', 'pivot-self-repair-scheduled',
    'pivot-dedicated-fixer-scheduled', 'pivot-stopped', 'safe-write-proposal-usage-recorded',
    'safe-write-proposal-stopped', 'paused', 'completed', 'failed',
  ]),
}).strict().superRefine((event, context) => {
  const pivotEvent = event.type === 'pivot-decided'
    || event.type === 'pivot-retry-scheduled'
    || event.type === 'pivot-self-repair-scheduled'
    || event.type === 'pivot-dedicated-fixer-scheduled'
    || event.type === 'pivot-stopped'
  if (pivotEvent && !event.pivotDecisionId) {
    context.addIssue({ code: 'custom', message: 'Pivot lifecycle events require a decision identifier', path: ['pivotDecisionId'] })
  }
  if (!pivotEvent && event.pivotDecisionId) {
    context.addIssue({ code: 'custom', message: 'Only Pivot lifecycle events may contain a decision identifier', path: ['pivotDecisionId'] })
  }
})

export const AxisRunStateSchema = z.object({
  budget: BudgetEnvelopeSchema,
  createdAt: TimestampSchema,
  events: z.array(AxisRunLifecycleEventSchema).min(1).max(20_000),
  objective: z.string().trim().min(1).max(8_000),
  restartCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  status: z.enum(['planned', 'running', 'paused', 'cancelled', 'completed', 'failed', 'stopped']),
  tasks: z.array(AxisTaskRunStateSchema).max(128),
  updatedAt: TimestampSchema,
  usage: EngineBudgetUsageSchema,
}).strict().superRefine((state, context) => {
  const ids = new Set<string>()
  for (const [index, task] of state.tasks.entries()) {
    if (ids.has(task.taskId)) context.addIssue({ code: 'custom', message: 'Task run-state identifiers must be unique', path: ['tasks', index, 'taskId'] })
    ids.add(task.taskId)
  }
  for (const [index, event] of state.events.entries()) {
    if (event.revision !== index + 1) context.addIssue({ code: 'custom', message: 'Run-state event revisions must be contiguous and start at 1', path: ['events', index, 'revision'] })
  }
  if (state.events.at(-1)?.revision !== state.revision) {
    context.addIssue({ code: 'custom', message: 'Run-state revision must match the latest lifecycle event', path: ['revision'] })
  }
  if (state.status === 'planned' && state.tasks.some((task) => task.status !== 'pending')) {
    context.addIssue({ code: 'custom', message: 'Planned runs require pending task states', path: ['tasks'] })
  }
  const latestEvent = state.events.at(-1)
  const pivotStopEvents = state.events.filter(({ type }) => type === 'pivot-stopped')
  if (pivotStopEvents.length > 1 || (pivotStopEvents.length === 1 && latestEvent?.type !== 'pivot-stopped')) {
    context.addIssue({ code: 'custom', message: 'Pivot stop must be the unique latest Run event', path: ['events'] })
  }
  if (latestEvent?.type === 'pivot-stopped' && state.status !== 'stopped') {
    context.addIssue({ code: 'custom', message: 'Pivot-stopped events require stopped Run status', path: ['status'] })
  }
  if (
    state.status === 'stopped'
    && state.tasks.length > 0
    && latestEvent?.type !== 'pivot-stopped'
  ) {
    context.addIssue({ code: 'custom', message: 'Stopped Runs with task evidence require a Pivot stop event', path: ['tasks'] })
  }
  if (
    latestEvent?.type === 'pivot-stopped'
    && state.tasks.some(({ status }) => status === 'pending' || status === 'running')
  ) {
    context.addIssue({ code: 'custom', message: 'Pivot-stopped Runs cannot contain unfinished task states', path: ['tasks'] })
  }
})

export const AxisRunStateTransitionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisDryRunApprovalRequestSchema = AxisRunStateTransitionRequestSchema.extend({
  approvedTaskIds: z.array(IdentifierSchema).min(1).max(128),
}).strict().superRefine((request, context) => {
  if (new Set(request.approvedTaskIds).size !== request.approvedTaskIds.length) {
    context.addIssue({ code: 'custom', message: 'Approved task identifiers must be unique', path: ['approvedTaskIds'] })
  }
})

export const AxisDryRunFeatureStateSchema = z.object({
  enabled: z.boolean(),
  reason: z.literal('disabled').nullable(),
}).strict()

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest')

export const AxisReplanRequestSchema = z.object({
  budget: BudgetEnvelopeSchema,
  context: AxisPlanningContextSchema,
  expectedRevision: z.number().int().positive(),
  parentRunId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisPlanLineageSchema = z.object({
  attemptId: IdentifierSchema,
  budget: BudgetEnvelopeSchema,
  childRunId: IdentifierSchema.nullable(),
  createdAt: TimestampSchema,
  error: z.string().trim().min(1).max(16_000).nullable(),
  fileScope: z.array(z.string().trim().min(1).max(1_024)).max(2_000),
  fileScopeDigest: Sha256Schema,
  generation: z.number().int().min(2).max(10_000),
  objective: z.string().trim().min(1).max(8_000),
  objectiveDigest: Sha256Schema,
  parentRunId: IdentifierSchema,
  rootRunId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  sourceRevision: z.number().int().positive(),
  status: z.enum(['planning', 'materializing', 'completed', 'failed', 'stale', 'interrupted']),
  updatedAt: TimestampSchema,
}).strict().superRefine((lineage, context) => {
  if (new Set(lineage.fileScope).size !== lineage.fileScope.length) {
    context.addIssue({ code: 'custom', message: 'Plan lineage file scope must contain unique paths', path: ['fileScope'] })
  }
  const needsChild = lineage.status === 'materializing' || lineage.status === 'completed' || lineage.status === 'stale'
  const forbidsChild = lineage.status === 'planning' || lineage.status === 'failed'
  if ((needsChild && !lineage.childRunId) || (forbidsChild && lineage.childRunId)) {
    context.addIssue({ code: 'custom', message: 'Plan lineage child run must match its lifecycle status', path: ['childRunId'] })
  }
  const needsError = lineage.status === 'failed' || lineage.status === 'stale' || lineage.status === 'interrupted'
  if (needsError !== Boolean(lineage.error)) {
    context.addIssue({ code: 'custom', message: 'Plan lineage error must match its terminal failure status', path: ['error'] })
  }
})

export type AxisTask = z.infer<typeof AxisTaskSchema>
export type AxisTaskProposal = z.infer<typeof AxisTaskProposalSchema>
export type AxisPivotAction = z.infer<typeof AxisPivotActionSchema>
export type AxisPivotTrigger = z.infer<typeof AxisPivotTriggerSchema>
export type AxisPivotRequest = z.infer<typeof AxisPivotRequestSchema>
export type AxisPivotDecisionRecord = z.infer<typeof AxisPivotDecisionRecordSchema>
export type AxisRemainingBudget = z.infer<typeof AxisRemainingBudgetSchema>
export type AxisDagSchedule = z.infer<typeof AxisDagScheduleSchema>
export type AxisModelUsage = z.infer<typeof AxisModelUsageSchema>
export type AxisClassificationProposal = z.infer<typeof AxisClassificationProposalSchema>
export type AxisPlanningContext = z.infer<typeof AxisPlanningContextSchema>
export type AxisShadowRunRequest = z.infer<typeof AxisShadowRunRequestSchema>
export type AxisShadowRunResult = z.infer<typeof AxisShadowRunResultSchema>
export type AxisShadowPlanRequest = z.infer<typeof AxisShadowPlanRequestSchema>
export type AxisShadowState = z.infer<typeof AxisShadowStateSchema>
export type AxisRunState = z.infer<typeof AxisRunStateSchema>
export type AxisRunLifecycleEvent = z.infer<typeof AxisRunLifecycleEventSchema>
export type AxisTaskRunState = z.infer<typeof AxisTaskRunStateSchema>
export type AxisRunStateTransitionRequest = z.infer<typeof AxisRunStateTransitionRequestSchema>
export type AxisReplanRequest = z.infer<typeof AxisReplanRequestSchema>
export type AxisPlanLineage = z.infer<typeof AxisPlanLineageSchema>
export type AxisDryRunApprovalRequest = z.infer<typeof AxisDryRunApprovalRequestSchema>
export type AxisDryRunFeatureState = z.infer<typeof AxisDryRunFeatureStateSchema>
export type AxisPermissionEvaluation = z.infer<typeof AxisPermissionEvaluationSchema>
export type AxisCheckpointEvaluation = z.infer<typeof AxisCheckpointEvaluationSchema>
export type AxisReviewEvaluation = z.infer<typeof AxisReviewEvaluationSchema>
export type {
  AxisAuthorityAuditEntry,
  AxisCheckpointReceipt,
  AxisCheckpointReceiptBatch,
  AxisExecutionAuthorityEnvelope,
  AxisExecutionGrant,
  AxisExecutionTransaction,
  AxisFakeMutationReceipt,
  AxisGuardedExecutionResult,
  AxisGuardedSafeWriteCompletionEvidence,
  AxisGuardedSafeWriteResult,
  AxisMutationIntent,
  AxisRollbackOutcome,
  AxisRollbackOwner,
  AxisSafeWriteIntent,
  AxisSafeWriteReceipt,
} from './axis-execution-contracts'
export type {
  AxisGateBatchResult,
  AxisGateRunEvidence,
  GateResult,
} from './axis-gate-contracts'
export type BudgetEnvelope = z.infer<typeof BudgetEnvelopeSchema>
export type ComplexityReport = z.infer<typeof ComplexityReportSchema>
export type EngineBudgetUsage = z.infer<typeof EngineBudgetUsageSchema>
export type EngineTrace = z.infer<typeof EngineTraceSchema>
export type PivotDecision = z.infer<typeof PivotDecisionSchema>
export type TaskDag = z.infer<typeof TaskDagSchema>
export type TaskDagProposal = z.infer<typeof TaskDagProposalSchema>
export type WorkerResult = z.infer<typeof WorkerResultSchema>

export type EngineStopReason = z.infer<typeof EngineStopReasonSchema>
