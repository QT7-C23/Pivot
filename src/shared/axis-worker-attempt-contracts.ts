import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })
const ErrorSchema = z.string().trim().min(1).max(4_000)

export const AxisWorkerAttemptLookupSchema = z.object({
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict()

export const AxisWorkerAttemptBeginInputSchema = AxisWorkerAttemptLookupSchema.extend({
  attempt: z.number().int().positive(),
  workerId: IdentifierSchema,
}).strict()

export const AxisWorkerAttemptFinishInputSchema = AxisWorkerAttemptLookupSchema.extend({
  attemptId: IdentifierSchema,
  error: ErrorSchema.nullable(),
  expectedRevision: z.number().int().positive(),
  status: z.enum(['completed', 'failed', 'cancelled']),
  workerId: IdentifierSchema,
}).strict().superRefine((input, context) => {
  if (input.status === 'completed' && input.error !== null) {
    context.addIssue({
      code: 'custom',
      message: 'Completed Worker attempts cannot contain an error',
      path: ['error'],
    })
  }
  if (input.status !== 'completed' && input.error === null) {
    context.addIssue({
      code: 'custom',
      message: `${input.status} Worker attempts require an error`,
      path: ['error'],
    })
  }
})

export const AxisWorkerAttemptBindingSchema = z.object({
  attempt: z.number().int().positive(),
  attemptId: IdentifierSchema,
  error: ErrorSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
  revision: z.number().int().positive(),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  startedAt: TimestampSchema,
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  taskId: IdentifierSchema,
  updatedAt: TimestampSchema,
  workerId: IdentifierSchema,
}).strict().superRefine((attempt, context) => {
  if (attempt.status === 'running') {
    if (attempt.revision !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Running Worker attempts must remain at revision 1',
        path: ['revision'],
      })
    }
    if (attempt.finishedAt !== null || attempt.error !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Running Worker attempts cannot contain terminal evidence',
        path: ['finishedAt'],
      })
    }
    return
  }
  if (attempt.revision < 2 || attempt.finishedAt === null) {
    context.addIssue({
      code: 'custom',
      message: 'Terminal Worker attempts require revision and completion evidence',
      path: ['finishedAt'],
    })
  }
  if (attempt.status === 'completed' && attempt.error !== null) {
    context.addIssue({
      code: 'custom',
      message: 'Completed Worker attempts cannot contain an error',
      path: ['error'],
    })
  }
  if (
    (attempt.status === 'failed' || attempt.status === 'cancelled')
    && attempt.error === null
  ) {
    context.addIssue({
      code: 'custom',
      message: `${attempt.status} Worker attempts require an error`,
      path: ['error'],
    })
  }
})

export const AxisSelfRepairAssignmentCreateInputSchema = z.object({
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  issue: ErrorSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  sourceAttempt: z.number().int().positive(),
  sourceAttemptId: IdentifierSchema,
  taskId: IdentifierSchema,
  workerId: IdentifierSchema,
}).strict()

export const AxisSelfRepairAssignmentSchema = AxisSelfRepairAssignmentCreateInputSchema.extend({
  assignmentId: IdentifierSchema,
  createdAt: TimestampSchema,
  schemaVersion: z.literal(1),
  status: z.literal('assigned'),
}).strict()

export type AxisWorkerAttemptLookup = z.infer<typeof AxisWorkerAttemptLookupSchema>
export type AxisWorkerAttemptBeginInput = z.infer<
  typeof AxisWorkerAttemptBeginInputSchema
>
export type AxisWorkerAttemptFinishInput = z.infer<
  typeof AxisWorkerAttemptFinishInputSchema
>
export type AxisWorkerAttemptBinding = z.infer<
  typeof AxisWorkerAttemptBindingSchema
>
export type AxisSelfRepairAssignmentCreateInput = z.infer<
  typeof AxisSelfRepairAssignmentCreateInputSchema
>
export type AxisSelfRepairAssignment = z.infer<
  typeof AxisSelfRepairAssignmentSchema
>
