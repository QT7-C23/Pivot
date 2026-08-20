import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)

export const AxisPivotReplanRunDriveRequestSchema = z.object({
  decisionId: IdentifierSchema,
}).strict()

export const AxisPivotReplanRunDriveResultSchema = z.object({
  action: z.literal('replan'),
  authority: z.literal('pivot-main-replan-run-driver'),
  childRunId: IdentifierSchema,
  completedTaskIds: z.array(IdentifierSchema).max(100),
  decisionId: IdentifierSchema,
  failureReason: z.string().trim().min(1).max(8_000).nullable(),
  finalStateRevision: z.number().int().positive(),
  orchestrationIds: z.array(IdentifierSchema).min(1).max(100),
  parentRunId: IdentifierSchema,
  scheduleIds: z.array(IdentifierSchema).min(1).max(100),
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.enum(['completed', 'failed']),
}).strict().superRefine((result, context) => {
  for (const [field, values] of [
    ['completedTaskIds', result.completedTaskIds],
    ['orchestrationIds', result.orchestrationIds],
    ['scheduleIds', result.scheduleIds],
  ] as const) {
    if (new Set(values).size !== values.length) context.addIssue({
      code: 'custom', message: `${field} must contain unique identifiers`, path: [field],
    })
  }
  if (result.scheduleIds.length !== result.orchestrationIds.length) {
    context.addIssue({
      code: 'custom', message: 'Every replan schedule requires one orchestration',
    })
  }
  if (result.completedTaskIds.length > result.scheduleIds.length) {
    context.addIssue({
      code: 'custom', message: 'Completed Tasks cannot exceed scheduled Tasks',
    })
  }
  if ((result.status === 'completed') !== (result.failureReason === null)) {
    context.addIssue({
      code: 'custom', message: 'Replan Run drive failure reason must match terminal status',
      path: ['failureReason'],
    })
  }
})

export type AxisPivotReplanRunDriveRequest = z.infer<
  typeof AxisPivotReplanRunDriveRequestSchema
>
export type AxisPivotReplanRunDriveResult = z.infer<
  typeof AxisPivotReplanRunDriveResultSchema
>
