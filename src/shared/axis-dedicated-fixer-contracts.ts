import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })
const IssueSchema = z.string().trim().min(1).max(4_000)

export const AxisDedicatedFixerIdentitySchema = z.object({
  fixerId: IdentifierSchema,
  role: z.literal('security-fixer'),
  schemaVersion: z.literal(1),
  specialty: z.literal('security'),
}).strict()

const AssignmentCreateShape = {
  decisionId: IdentifierSchema,
  executionRevision: z.number().int().positive(),
  fixer: AxisDedicatedFixerIdentitySchema,
  issue: IssueSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  sourceAttempt: z.number().int().positive(),
  sourceAttemptId: IdentifierSchema,
  sourceWorkerId: IdentifierSchema,
  taskId: IdentifierSchema,
}

export const AxisDedicatedFixerAssignmentCreateInputSchema = z.object(
  AssignmentCreateShape,
).strict().superRefine(requireDifferentWorker)

export const AxisDedicatedFixerAssignmentSchema = z.object({
  ...AssignmentCreateShape,
  assignmentId: IdentifierSchema,
  createdAt: TimestampSchema,
  schemaVersion: z.literal(1),
  status: z.literal('assigned'),
}).strict().superRefine(requireDifferentWorker)

export type AxisDedicatedFixerIdentity = z.infer<
  typeof AxisDedicatedFixerIdentitySchema
>
export type AxisDedicatedFixerAssignmentCreateInput = z.infer<
  typeof AxisDedicatedFixerAssignmentCreateInputSchema
>
export type AxisDedicatedFixerAssignment = z.infer<
  typeof AxisDedicatedFixerAssignmentSchema
>

function requireDifferentWorker(
  assignment: {
    fixer: AxisDedicatedFixerIdentity
    sourceWorkerId: string
  },
  context: z.RefinementCtx,
): void {
  if (assignment.fixer.fixerId === assignment.sourceWorkerId) {
    context.addIssue({
      code: 'custom',
      message: 'Dedicated Fixer must be different from the source Worker',
      path: ['fixer', 'fixerId'],
    })
  }
}
