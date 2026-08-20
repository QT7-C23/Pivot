import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 file key')
const LeaseTtlSchema = z.number().int().min(1_000).max(5 * 60_000)
const FilePathSchema = z.string().trim().min(1).max(1_024)
const LeaseMutationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  leaseId: IdentifierSchema,
}).strict()
const LeaseMutationListSchema = z.array(LeaseMutationSchema).min(1).max(128)
  .superRefine((leases, context) => {
    const leaseIds = new Set<string>()
    for (const [index, lease] of leases.entries()) {
      if (leaseIds.has(lease.leaseId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate lease mutation: ${lease.leaseId}`,
          path: [index, 'leaseId'],
        })
      }
      leaseIds.add(lease.leaseId)
    }
  })

export const AxisFileLeaseBindingSchema = z.object({
  projectId: IdentifierSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict()

export const AxisFileLeaseRunBindingSchema = AxisFileLeaseBindingSchema.pick({
  runId: true,
  sessionId: true,
})

export const AxisFileLeaseSessionBindingSchema = AxisFileLeaseBindingSchema.pick({
  sessionId: true,
})

export const AxisFileIdentitySchema = z.object({
  fileKey: Sha256Schema,
  projectRelativePath: FilePathSchema,
}).strict()

export const AxisFileLeaseAcquireRequestSchema = z.object({
  filePath: FilePathSchema,
  ttlMs: LeaseTtlSchema,
}).strict()

export const AxisFileLeaseRenewRequestSchema = LeaseMutationSchema.extend({
  ttlMs: LeaseTtlSchema,
}).strict()

export const AxisFileLeaseReleaseRequestSchema = LeaseMutationSchema

export const AxisFileLeaseBatchAcquireRequestSchema = z.object({
  filePaths: z.array(FilePathSchema).min(1).max(128),
  ttlMs: LeaseTtlSchema,
}).strict()

export const AxisFileLeaseBatchRenewRequestSchema = z.object({
  leases: LeaseMutationListSchema,
  ttlMs: LeaseTtlSchema,
}).strict()

export const AxisFileLeaseBatchReleaseRequestSchema = z.object({
  leases: LeaseMutationListSchema,
}).strict()

export const AxisFileLeaseBatchVerifyRequestSchema = z.object({
  leases: LeaseMutationListSchema,
}).strict()

export const AxisFileLeaseSchema = z.object({
  acquiredAt: TimestampSchema,
  expiresAt: TimestampSchema,
  fileKey: Sha256Schema,
  leaseId: IdentifierSchema,
  projectId: IdentifierSchema,
  projectRelativePath: FilePathSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.enum(['active', 'released', 'expired']),
  taskId: IdentifierSchema,
  updatedAt: TimestampSchema,
  version: z.number().int().positive(),
}).strict().superRefine((lease, context) => {
  if (Date.parse(lease.expiresAt) <= Date.parse(lease.acquiredAt)) {
    context.addIssue({
      code: 'custom',
      message: 'File lease expiry must be after acquisition',
      path: ['expiresAt'],
    })
  }
  if (Date.parse(lease.updatedAt) < Date.parse(lease.acquiredAt)) {
    context.addIssue({
      code: 'custom',
      message: 'File lease update cannot precede acquisition',
      path: ['updatedAt'],
    })
  }
})

export type AxisFileLeaseBinding = z.infer<typeof AxisFileLeaseBindingSchema>
export type AxisFileLeaseRunBinding = z.infer<typeof AxisFileLeaseRunBindingSchema>
export type AxisFileLeaseSessionBinding = z.infer<typeof AxisFileLeaseSessionBindingSchema>
export type AxisFileIdentity = z.infer<typeof AxisFileIdentitySchema>
export type AxisFileLeaseAcquireRequest = z.infer<typeof AxisFileLeaseAcquireRequestSchema>
export type AxisFileLeaseRenewRequest = z.infer<typeof AxisFileLeaseRenewRequestSchema>
export type AxisFileLeaseReleaseRequest = z.infer<typeof AxisFileLeaseReleaseRequestSchema>
export type AxisFileLeaseBatchAcquireRequest = z.infer<
  typeof AxisFileLeaseBatchAcquireRequestSchema
>
export type AxisFileLeaseBatchRenewRequest = z.infer<
  typeof AxisFileLeaseBatchRenewRequestSchema
>
export type AxisFileLeaseBatchReleaseRequest = z.infer<
  typeof AxisFileLeaseBatchReleaseRequestSchema
>
export type AxisFileLeaseBatchVerifyRequest = z.infer<
  typeof AxisFileLeaseBatchVerifyRequestSchema
>
export type AxisFileLease = z.infer<typeof AxisFileLeaseSchema>
