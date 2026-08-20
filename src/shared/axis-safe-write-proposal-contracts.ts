import { z } from 'zod'
import { AxisModelUsageSchema, AxisRunStateSchema } from './axis-engine-contracts'
import { AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS } from './axis-guarded-safe-write-contracts'
import { AxisReviewedSafeWriteReceiptSchema } from './axis-reviewed-proposal-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const FilePathSchema = z.string().trim().min(1).max(1_024)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)

const AxisSafeWriteProposalWriteSchema = z.object({
  content: z.string().max(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS),
  filePath: FilePathSchema,
}).strict()

function validateWriteSet(
  writes: Array<{ content: string; filePath: string }>,
  context: z.RefinementCtx,
): void {
  const filePaths = writes.map((write) => write.filePath)
  if (new Set(filePaths).size !== filePaths.length) {
    context.addIssue({
      code: 'custom',
      message: 'Axis safe-write proposal file paths must be unique',
      path: ['writes'],
    })
  }
  if (
    writes.reduce((total, write) => total + write.content.length, 0)
    > AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Axis safe-write proposal content exceeds the aggregate hard limit',
      path: ['writes'],
    })
  }
}

export const AxisSafeWriteProposalRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict()

export type AxisSafeWriteProposalRequest = z.infer<
  typeof AxisSafeWriteProposalRequestSchema
>

export const AxisSafeWriteProposalModelOutputSchema = z.object({
  writes: z.array(AxisSafeWriteProposalWriteSchema).min(1).max(16),
}).strict().superRefine((value, context) => validateWriteSet(value.writes, context))

export type AxisSafeWriteProposalModelOutput = z.infer<
  typeof AxisSafeWriteProposalModelOutputSchema
>

export const AxisSafeWriteProposalFileSchema = z.discriminatedUnion(
  'originalState',
  [
    z.object({
      filePath: FilePathSchema,
      originalContent: z.string().max(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS),
      originalSha256: Sha256Schema,
      originalState: z.literal('existing'),
      proposedContent: z.string().max(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS),
    }).strict(),
    z.object({
      filePath: FilePathSchema,
      originalContent: z.string().max(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS),
      originalSha256: z.null(),
      originalState: z.literal('missing'),
      proposedContent: z.string().max(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS),
    }).strict(),
  ],
)

export type AxisSafeWriteProposalFile = z.infer<
  typeof AxisSafeWriteProposalFileSchema
>

export const AxisSafeWriteProposalSchema = z.object({
  createdAt: TimestampSchema,
  expectedRevision: z.number().int().positive(),
  files: z.array(AxisSafeWriteProposalFileSchema).min(1).max(16),
  proposalId: IdentifierSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
  usage: AxisModelUsageSchema,
}).strict().superRefine((proposal, context) => {
  for (const [index, file] of proposal.files.entries()) {
    if (file.originalState === 'missing' && file.originalContent !== '') {
      context.addIssue({
        code: 'custom',
        message: 'Missing Axis proposal sources require empty original content',
        path: ['files', index, 'originalContent'],
      })
    }
  }
  const filePaths = proposal.files.map((file) => file.filePath)
  if (new Set(filePaths).size !== filePaths.length) {
    context.addIssue({
      code: 'custom',
      message: 'Axis safe-write proposal review file paths must be unique',
      path: ['files'],
    })
  }
  const originalChars = proposal.files.reduce(
    (total, file) => total + file.originalContent.length,
    0,
  )
  const proposedChars = proposal.files.reduce(
    (total, file) => total + file.proposedContent.length,
    0,
  )
  if (
    originalChars > AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS
    || proposedChars > AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Axis safe-write proposal review content exceeds the aggregate hard limit',
      path: ['files'],
    })
  }
})

export type AxisSafeWriteProposal = z.infer<
  typeof AxisSafeWriteProposalSchema
>

export const AxisSafeWriteProposalResultSchema = z.object({
  proposal: AxisSafeWriteProposalSchema,
  receipt: AxisReviewedSafeWriteReceiptSchema,
  runState: AxisRunStateSchema,
}).strict().superRefine((result, context) => {
  if (
    result.proposal.runId !== result.runState.runId
    || result.proposal.sessionId !== result.runState.sessionId
    || result.proposal.expectedRevision !== result.runState.revision
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Axis safe-write proposal ownership and revision must match authoritative run state',
    })
  }
  const task = result.runState.tasks.find(
    (candidate) => candidate.taskId === result.proposal.taskId,
  )
  if (!task || task.status !== 'pending') {
    context.addIssue({
      code: 'custom',
      message: 'Axis safe-write proposal requires an authoritative pending task',
      path: ['runState', 'tasks'],
    })
  }
  if (
    result.receipt.runId !== result.proposal.runId
    || result.receipt.sessionId !== result.proposal.sessionId
    || result.receipt.taskId !== result.proposal.taskId
    || result.receipt.proposalId !== result.proposal.proposalId
    || result.receipt.expectedRevision !== result.proposal.expectedRevision
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Axis reviewed proposal receipt must match proposal ownership and revision',
      path: ['receipt'],
    })
  }
  const receiptFiles = new Map(
    result.receipt.files.map((file) => [file.filePath, file]),
  )
  for (const [index, file] of result.proposal.files.entries()) {
    const receiptFile = receiptFiles.get(file.filePath)
    const originalMatches = file.originalState === 'missing'
      ? receiptFile?.state.kind === 'missing'
      : receiptFile?.state.kind === 'exists'
        && receiptFile.state.contentSha256 === file.originalSha256
    if (!receiptFile || !originalMatches) {
      context.addIssue({
        code: 'custom',
        message: 'Axis reviewed proposal receipt baseline must match every review file',
        path: ['receipt', 'files', index],
      })
    }
  }
  if (receiptFiles.size !== result.proposal.files.length) {
    context.addIssue({
      code: 'custom',
      message: 'Axis reviewed proposal receipt files must exactly match proposal files',
      path: ['receipt', 'files'],
    })
  }
})

export type AxisSafeWriteProposalResult = z.infer<
  typeof AxisSafeWriteProposalResultSchema
>
