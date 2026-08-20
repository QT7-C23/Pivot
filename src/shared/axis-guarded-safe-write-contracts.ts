import { z } from 'zod'
import {
  AxisGuardedSafeWriteResultSchema,
  AxisRunStateSchema,
} from './axis-engine-contracts'
import { AxisReviewedSafeWriteReceiptSchema } from './axis-reviewed-proposal-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const FilePathSchema = z.string().trim().min(1).max(1_024)

export const AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS = 4 * 1_024 * 1_024

export const AxisGuardedSafeWriteFeatureStateSchema = z.discriminatedUnion(
  'enabled',
  [
    z.object({
      enabled: z.literal(true),
      reason: z.null(),
    }).strict(),
    z.object({
      enabled: z.literal(false),
      reason: z.literal('disabled'),
    }).strict(),
  ],
)

export type AxisGuardedSafeWriteFeatureState = z.infer<
  typeof AxisGuardedSafeWriteFeatureStateSchema
>

export const AxisGuardedSafeWriteSubmissionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reviewedProposalReceipt: AxisReviewedSafeWriteReceiptSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
  writes: z.array(z.object({
    content: z.string().max(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS),
    filePath: FilePathSchema,
  }).strict()).min(1).max(16),
}).strict().superRefine((request, context) => {
  const filePaths = request.writes.map((write) => write.filePath)
  if (new Set(filePaths).size !== filePaths.length) {
    context.addIssue({
      code: 'custom',
      message: 'Guarded safe-write file paths must be unique',
      path: ['writes'],
    })
  }
  const contentChars = request.writes.reduce(
    (total, write) => total + write.content.length,
    0,
  )
  if (contentChars > AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS) {
    context.addIssue({
      code: 'custom',
      message: 'Guarded safe-write content exceeds the aggregate hard limit',
      path: ['writes'],
    })
  }
})

export type AxisGuardedSafeWriteSubmission = z.infer<
  typeof AxisGuardedSafeWriteSubmissionSchema
>

export const AxisGuardedSafeWriteSubmissionResultSchema = z.object({
  execution: AxisGuardedSafeWriteResultSchema,
  runState: AxisRunStateSchema,
}).strict().superRefine((result, context) => {
  if (
    result.execution.runId !== result.runState.runId
    || result.execution.sessionId !== result.runState.sessionId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Guarded safe-write result ownership must match the authoritative run state',
    })
  }
  const task = result.runState.tasks.find(
    (candidate) => candidate.taskId === result.execution.taskId,
  )
  if (!task) {
    context.addIssue({
      code: 'custom',
      message: 'Guarded safe-write task ownership must match the authoritative run state',
      path: ['execution', 'taskId'],
    })
    return
  }
  const expectedTaskStatus = result.execution.status === 'completed'
    ? 'completed'
    : 'failed'
  if (task.status !== expectedTaskStatus) {
    context.addIssue({
      code: 'custom',
      message: `Guarded safe-write execution requires authoritative task status ${expectedTaskStatus}`,
      path: ['runState', 'tasks'],
    })
  }
  if (
    result.execution.status !== 'completed'
    && result.runState.status !== 'failed'
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Failed guarded safe-write execution requires a failed authoritative run state',
      path: ['runState', 'status'],
    })
  }
})

export type AxisGuardedSafeWriteSubmissionResult = z.infer<
  typeof AxisGuardedSafeWriteSubmissionResultSchema
>
