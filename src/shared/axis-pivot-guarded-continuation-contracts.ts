import { z } from 'zod'
import {
  AxisGuardedSafeWriteSubmissionResultSchema,
  AxisGuardedSafeWriteSubmissionSchema,
} from './axis-guarded-safe-write-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const AxisPivotGuardedContinuationRequestSchema = z.object({
  decisionId: IdentifierSchema,
  handoffId: IdentifierSchema,
  submission: AxisGuardedSafeWriteSubmissionSchema,
}).strict()

export const AxisPivotGuardedContinuationAttemptSchema = z.object({
  action: z.enum(['replan', 'retry', 'self-repair', 'dedicated-fixer']),
  attemptId: IdentifierSchema,
  createdAt: TimestampSchema,
  decisionId: IdentifierSchema,
  error: z.string().trim().min(1).max(4_000).nullable(),
  guardedResult: AxisGuardedSafeWriteSubmissionResultSchema.nullable(),
  handoffId: IdentifierSchema,
  proposalId: IdentifierSchema,
  requestSha256: Sha256Schema,
  reviewedProposalReceiptId: IdentifierSchema,
  revision: z.number().int().positive(),
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  sourceRunId: IdentifierSchema,
  status: z.enum([
    'submitting',
    'completed',
    'failed',
    'recovery-required',
  ]),
  submittedTaskId: IdentifierSchema,
  targetRunId: IdentifierSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((attempt, context) => {
  const hasResult = attempt.guardedResult !== null
  const hasError = attempt.error !== null
  if (attempt.status === 'completed') {
    if (!hasResult || hasError) {
      context.addIssue({
        code: 'custom',
        message: 'Completed guarded continuation requires a result and no error',
      })
    }
  } else if (attempt.status === 'submitting') {
    if (hasResult || hasError) {
      context.addIssue({
        code: 'custom',
        message: 'Submitting guarded continuation cannot contain a result or error',
      })
    }
  } else if (hasResult || !hasError) {
    context.addIssue({
      code: 'custom',
      message: 'Failed or interrupted guarded continuation requires an error and no result',
    })
  }

  const result = attempt.guardedResult
  if (result && (
    result.execution.runId !== attempt.targetRunId
    || result.execution.sessionId !== attempt.sessionId
    || result.execution.taskId !== attempt.submittedTaskId
  )) {
    context.addIssue({
      code: 'custom',
      message: 'Guarded continuation result ownership must match its submitted target',
      path: ['guardedResult'],
    })
  }
})

export type AxisPivotGuardedContinuationRequest = z.infer<
  typeof AxisPivotGuardedContinuationRequestSchema
>
export type AxisPivotGuardedContinuationAttempt = z.infer<
  typeof AxisPivotGuardedContinuationAttemptSchema
>
