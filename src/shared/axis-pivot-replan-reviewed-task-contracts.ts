import { z } from 'zod'
import { AxisPivotGuardedContinuationAttemptSchema } from './axis-pivot-guarded-continuation-contracts'
import { AxisSafeWriteProposalResultSchema } from './axis-safe-write-proposal-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })

export const AxisPivotReplanReviewedTaskRequestSchema = z.object({
  scheduleId: IdentifierSchema,
}).strict()

export const AxisPivotReplanReviewedTaskOrchestrationSchema = z.object({
  action: z.literal('replan'),
  childStateRevision: z.number().int().positive(),
  continuationAttempt: AxisPivotGuardedContinuationAttemptSchema.nullable(),
  createdAt: TimestampSchema,
  decisionId: IdentifierSchema,
  error: z.string().trim().min(1).max(4_000).nullable(),
  handoffId: IdentifierSchema,
  orchestrationId: IdentifierSchema,
  proposalResult: AxisSafeWriteProposalResultSchema.nullable(),
  revision: z.number().int().positive(),
  scheduleId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  sourceRunId: IdentifierSchema,
  status: z.enum([
    'preparing',
    'submitting',
    'completed',
    'failed',
    'recovery-required',
  ]),
  submittedTaskId: IdentifierSchema,
  targetRunId: IdentifierSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((orchestration, context) => {
  const hasProposal = orchestration.proposalResult !== null
  const hasContinuation = orchestration.continuationAttempt !== null
  const hasError = orchestration.error !== null
  if (orchestration.status === 'preparing') {
    if (hasProposal || hasContinuation || hasError) context.addIssue({
      code: 'custom',
      message: 'Preparing replan task orchestration cannot contain proposal, continuation or error evidence',
    })
  } else if (orchestration.status === 'submitting') {
    if (!hasProposal || hasContinuation || hasError) context.addIssue({
      code: 'custom',
      message: 'Submitting replan task orchestration requires only proposal evidence',
    })
  } else if (orchestration.status === 'completed') {
    if (!hasProposal || !hasContinuation || hasError) context.addIssue({
      code: 'custom',
      message: 'Completed replan task orchestration requires proposal and continuation evidence',
    })
  } else if (hasContinuation || !hasError) {
    context.addIssue({
      code: 'custom',
      message: 'Failed or interrupted replan task orchestration requires an error and no continuation',
    })
  }
  const proposal = orchestration.proposalResult?.proposal
  if (proposal && (
    proposal.runId !== orchestration.targetRunId
    || proposal.sessionId !== orchestration.sessionId
    || proposal.taskId !== orchestration.submittedTaskId
    || proposal.expectedRevision !== orchestration.childStateRevision + 1
  )) context.addIssue({
    code: 'custom',
    message: 'Replan reviewed proposal ownership must match its schedule',
    path: ['proposalResult'],
  })
  const continuation = orchestration.continuationAttempt
  if (continuation && (
    continuation.action !== 'replan'
    || continuation.decisionId !== orchestration.decisionId
    || continuation.handoffId !== orchestration.handoffId
    || continuation.sessionId !== orchestration.sessionId
    || continuation.sourceRunId !== orchestration.sourceRunId
    || continuation.targetRunId !== orchestration.targetRunId
    || continuation.submittedTaskId !== orchestration.submittedTaskId
  )) context.addIssue({
    code: 'custom',
    message: 'Replan continuation attempt ownership must match its schedule orchestration',
    path: ['continuationAttempt'],
  })
})

export type AxisPivotReplanReviewedTaskRequest = z.infer<
  typeof AxisPivotReplanReviewedTaskRequestSchema
>
export type AxisPivotReplanReviewedTaskOrchestration = z.infer<
  typeof AxisPivotReplanReviewedTaskOrchestrationSchema
>
