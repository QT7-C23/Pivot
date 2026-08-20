import { z } from 'zod'
import { AxisFileFingerprintStateSchema } from './axis-file-fingerprint-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const FilePathSchema = z.string().trim().min(1).max(1_024)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)

export const AxisReviewedSafeWriteReceiptFileSchema = z.object({
  fileKey: Sha256Schema,
  filePath: FilePathSchema,
  projectRelativePath: FilePathSchema,
  proposedContentSha256: Sha256Schema,
  state: AxisFileFingerprintStateSchema,
}).strict()

export type AxisReviewedSafeWriteReceiptFile = z.infer<
  typeof AxisReviewedSafeWriteReceiptFileSchema
>

export const AxisReviewedSafeWriteReceiptSchema = z.object({
  expectedRevision: z.number().int().positive(),
  expiresAt: TimestampSchema,
  files: z.array(AxisReviewedSafeWriteReceiptFileSchema).min(1).max(16),
  issuedAt: TimestampSchema,
  issuer: z.literal('pivot-main'),
  projectId: IdentifierSchema,
  proposalId: IdentifierSchema,
  receiptId: IdentifierSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  signature: Sha256Schema,
  taskId: IdentifierSchema,
}).strict().superRefine((receipt, context) => {
  if (Date.parse(receipt.expiresAt) <= Date.parse(receipt.issuedAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Reviewed proposal receipt expiry must be after issuance',
      path: ['expiresAt'],
    })
  }
  const seenFileKeys = new Set<string>()
  const seenFilePaths = new Set<string>()
  const seenRelativePaths = new Set<string>()
  for (const [index, file] of receipt.files.entries()) {
    if (seenFileKeys.has(file.fileKey)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate reviewed proposal file identity: ${file.fileKey}`,
        path: ['files', index, 'fileKey'],
      })
    }
    if (seenFilePaths.has(file.filePath)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate reviewed proposal file path: ${file.filePath}`,
        path: ['files', index, 'filePath'],
      })
    }
    if (seenRelativePaths.has(file.projectRelativePath)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate reviewed proposal project path: ${file.projectRelativePath}`,
        path: ['files', index, 'projectRelativePath'],
      })
    }
    seenFileKeys.add(file.fileKey)
    seenFilePaths.add(file.filePath)
    seenRelativePaths.add(file.projectRelativePath)
  }
})

export type AxisReviewedSafeWriteReceipt = z.infer<
  typeof AxisReviewedSafeWriteReceiptSchema
>
