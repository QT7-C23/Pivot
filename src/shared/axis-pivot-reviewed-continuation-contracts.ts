import { z } from 'zod'
import { AxisPivotGuardedContinuationAttemptSchema } from './axis-pivot-guarded-continuation-contracts'
import { AxisSafeWriteProposalResultSchema } from './axis-safe-write-proposal-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })

export const AxisPivotReviewedContinuationRequestSchema = z.object({
  decisionId: IdentifierSchema,
}).strict()

export const AxisPivotReviewedContinuationOrchestrationSchema = z.object({
  action: z.enum(['retry', 'self-repair', 'dedicated-fixer']),
  continuationAttempt: AxisPivotGuardedContinuationAttemptSchema.nullable(),
  createdAt: TimestampSchema,
  decisionId: IdentifierSchema,
  error: z.string().trim().min(1).max(4_000).nullable(),
  handoffId: IdentifierSchema,
  orchestrationId: IdentifierSchema,
  proposalResult: AxisSafeWriteProposalResultSchema.nullable(),
  revision: z.number().int().positive(),
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
    if (hasProposal || hasContinuation || hasError) {
      context.addIssue({
        code: 'custom',
        message: 'Preparing reviewed continuation cannot contain proposal, continuation or error evidence',
      })
    }
  } else if (orchestration.status === 'submitting') {
    if (!hasProposal || hasContinuation || hasError) {
      context.addIssue({
        code: 'custom',
        message: 'Submitting reviewed continuation requires only proposal evidence',
      })
    }
  } else if (orchestration.status === 'completed') {
    if (!hasProposal || !hasContinuation || hasError) {
      context.addIssue({
        code: 'custom',
        message: 'Completed reviewed continuation requires proposal and continuation evidence',
      })
    }
  } else if (hasContinuation || !hasError) {
    context.addIssue({
      code: 'custom',
      message: 'Failed or interrupted reviewed continuation requires an error and no continuation result',
    })
  }

  const proposal = orchestration.proposalResult?.proposal
  if (proposal && (
    proposal.runId !== orchestration.targetRunId
    || proposal.sessionId !== orchestration.sessionId
    || proposal.taskId !== orchestration.submittedTaskId
  )) {
    context.addIssue({
      code: 'custom',
      message: 'Reviewed proposal ownership must match the orchestration target',
      path: ['proposalResult'],
    })
  }
  const continuation = orchestration.continuationAttempt
  if (continuation && (
    continuation.action !== orchestration.action
    || continuation.decisionId !== orchestration.decisionId
    || continuation.handoffId !== orchestration.handoffId
    || continuation.sessionId !== orchestration.sessionId
    || continuation.sourceRunId !== orchestration.sourceRunId
    || continuation.targetRunId !== orchestration.targetRunId
    || continuation.submittedTaskId !== orchestration.submittedTaskId
  )) {
    context.addIssue({
      code: 'custom',
      message: 'Continuation attempt ownership must match its orchestration',
      path: ['continuationAttempt'],
    })
  }
})

export type AxisPivotReviewedContinuationRequest = z.infer<
  typeof AxisPivotReviewedContinuationRequestSchema
>
export type AxisPivotReviewedContinuationOrchestration = z.infer<
  typeof AxisPivotReviewedContinuationOrchestrationSchema
>
