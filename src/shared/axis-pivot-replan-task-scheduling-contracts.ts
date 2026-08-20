import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })

export const AxisPivotReplanTaskScheduleRequestSchema = z.object({
  decisionId: IdentifierSchema,
}).strict()

export const AxisPivotReplanTaskScheduleSchema = z.object({
  action: z.literal('replan'),
  authority: z.literal('pivot-main-replan-task-scheduler'),
  childRunId: IdentifierSchema,
  childStateRevision: z.number().int().positive(),
  createdAt: TimestampSchema,
  decisionId: IdentifierSchema,
  dependencyTaskIds: z.array(IdentifierSchema).max(128),
  executionRevision: z.number().int().positive(),
  handoffId: IdentifierSchema,
  lineageAttemptId: IdentifierSchema,
  parentRunId: IdentifierSchema,
  scheduleId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.literal('scheduled'),
  taskId: IdentifierSchema,
}).strict().superRefine((schedule, context) => {
  if (new Set(schedule.dependencyTaskIds).size !== schedule.dependencyTaskIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Scheduled replan task dependencies must be unique',
      path: ['dependencyTaskIds'],
    })
  }
  if (schedule.dependencyTaskIds.includes(schedule.taskId)) {
    context.addIssue({
      code: 'custom',
      message: 'Scheduled replan task cannot depend on itself',
      path: ['dependencyTaskIds'],
    })
  }
})

export type AxisPivotReplanTaskScheduleRequest = z.infer<
  typeof AxisPivotReplanTaskScheduleRequestSchema
>
export type AxisPivotReplanTaskSchedule = z.infer<
  typeof AxisPivotReplanTaskScheduleSchema
>
