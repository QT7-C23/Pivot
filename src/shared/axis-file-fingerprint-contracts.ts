import { z } from 'zod'
import { AxisFileLeaseBindingSchema } from './axis-file-lease-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const FilePathSchema = z.string().trim().min(1).max(1_024)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 digest')
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)
const ProofSchema = z.string().regex(
  /^[A-Za-z0-9_-]{43}$/,
  'Expected a base64url-encoded SHA-256 proof',
)

export const AxisFileFingerprintExistingStateSchema = z.object({
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  contentSha256: Sha256Schema,
  fileInstanceSha256: Sha256Schema,
  kind: z.literal('exists'),
}).strict()

export const AxisFileFingerprintMissingStateSchema = z.object({
  kind: z.literal('missing'),
}).strict()

export const AxisFileFingerprintStateSchema = z.discriminatedUnion('kind', [
  AxisFileFingerprintExistingStateSchema,
  AxisFileFingerprintMissingStateSchema,
])

export const AxisFileFingerprintEvidenceSchema = AxisFileLeaseBindingSchema.extend({
  capturedAt: TimestampSchema,
  evidenceId: IdentifierSchema,
  expiresAt: TimestampSchema,
  fileKey: Sha256Schema,
  projectRelativePath: FilePathSchema,
  proof: ProofSchema,
  schemaVersion: z.literal(1),
  state: AxisFileFingerprintStateSchema,
}).strict().superRefine((evidence, context) => {
  if (Date.parse(evidence.expiresAt) <= Date.parse(evidence.capturedAt)) {
    context.addIssue({
      code: 'custom',
      message: 'File fingerprint expiry must be after capture',
      path: ['expiresAt'],
    })
  }
})

export const AxisFileFingerprintCaptureRequestSchema = z.object({
  filePaths: z.array(FilePathSchema).min(1).max(128),
}).strict()

export const AxisFileFingerprintVerifyRequestSchema = z.object({
  evidence: z.array(AxisFileFingerprintEvidenceSchema).min(1).max(128),
}).strict().superRefine((request, context) => {
  const evidenceIds = new Set<string>()
  const fileKeys = new Set<string>()
  for (const [index, evidence] of request.evidence.entries()) {
    if (evidenceIds.has(evidence.evidenceId)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate fingerprint evidence: ${evidence.evidenceId}`,
        path: ['evidence', index, 'evidenceId'],
      })
    }
    if (fileKeys.has(evidence.fileKey)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate fingerprint file identity: ${evidence.fileKey}`,
        path: ['evidence', index, 'fileKey'],
      })
    }
    evidenceIds.add(evidence.evidenceId)
    fileKeys.add(evidence.fileKey)
  }
})

const AxisFileFingerprintVerificationBaseSchema = z.object({
  checkedAt: TimestampSchema,
  evidenceId: IdentifierSchema,
  fileKey: Sha256Schema,
  projectRelativePath: FilePathSchema,
})

export const AxisFileFingerprintVerificationSchema = z.discriminatedUnion('status', [
  AxisFileFingerprintVerificationBaseSchema.extend({
    reason: z.null(),
    status: z.literal('matched'),
  }).strict(),
  AxisFileFingerprintVerificationBaseSchema.extend({
    reason: z.enum(['created', 'deleted', 'modified', 'replaced', 'stale']),
    status: z.literal('rejected'),
  }).strict(),
])

export const AxisFileFingerprintVerificationBatchSchema = z.object({
  results: z.array(AxisFileFingerprintVerificationSchema).min(1).max(128),
  schemaVersion: z.literal(1),
  status: z.enum(['matched', 'rejected']),
}).strict().superRefine((batch, context) => {
  const expectedStatus = batch.results.every((result) => result.status === 'matched')
    ? 'matched'
    : 'rejected'
  if (batch.status !== expectedStatus) {
    context.addIssue({
      code: 'custom',
      message: 'Fingerprint batch status must agree with every result',
      path: ['status'],
    })
  }
})

export type AxisFileFingerprintState = z.infer<typeof AxisFileFingerprintStateSchema>
export type AxisFileFingerprintEvidence = z.infer<typeof AxisFileFingerprintEvidenceSchema>
export type AxisFileFingerprintCaptureRequest = z.infer<
  typeof AxisFileFingerprintCaptureRequestSchema
>
export type AxisFileFingerprintVerifyRequest = z.infer<
  typeof AxisFileFingerprintVerifyRequestSchema
>
export type AxisFileFingerprintVerification = z.infer<
  typeof AxisFileFingerprintVerificationSchema
>
export type AxisFileFingerprintVerificationBatch = z.infer<
  typeof AxisFileFingerprintVerificationBatchSchema
>
