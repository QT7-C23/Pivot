import { z } from 'zod'
import { AxisFileFingerprintEvidenceSchema } from './axis-file-fingerprint-contracts'
import { AxisFileLeaseSchema } from './axis-file-lease-contracts'
import { AxisGateBatchResultSchema } from './axis-gate-contracts'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp')
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest')


export const AxisCheckpointReceiptSchema = z.object({
  checkpointId: IdentifierSchema.nullable(),
  filePath: z.string().trim().min(1).max(1_024),
  priorState: z.enum(['existing-file', 'new-file']),
  rollbackAction: z.enum(['restore-checkpoint', 'delete-created-file']),
}).strict().superRefine((receipt, context) => {
  if (receipt.priorState === 'existing-file' && (!receipt.checkpointId || receipt.rollbackAction !== 'restore-checkpoint')) {
    context.addIssue({ code: 'custom', message: 'Existing files require a checkpoint and restore rollback action', path: ['checkpointId'] })
  }
  if (receipt.priorState === 'new-file' && (receipt.checkpointId || receipt.rollbackAction !== 'delete-created-file')) {
    context.addIssue({ code: 'custom', message: 'New files cannot have a checkpoint and must use delete rollback', path: ['checkpointId'] })
  }
})

export const AxisExecutionGrantSchema = z.object({
  authority: z.literal('pivot-main'),
  grantedAt: TimestampSchema,
  grantedFiles: z.array(z.string().trim().min(1).max(1_024)).min(1).max(256),
  grantedTools: z.array(IdentifierSchema).min(1).max(64),
  projectRoot: z.string().trim().min(1).max(1_024),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.literal('granted'),
  taskId: IdentifierSchema,
}).strict().superRefine((grant, context) => {
  if (new Set(grant.grantedFiles).size !== grant.grantedFiles.length) {
    context.addIssue({ code: 'custom', message: 'Granted file capabilities must be unique', path: ['grantedFiles'] })
  }
  if (new Set(grant.grantedTools).size !== grant.grantedTools.length) {
    context.addIssue({ code: 'custom', message: 'Granted tool capabilities must be unique', path: ['grantedTools'] })
  }
})

export const AxisCheckpointReceiptBatchSchema = z.object({
  createdAt: TimestampSchema,
  projectRoot: z.string().trim().min(1).max(1_024),
  receipts: z.array(AxisCheckpointReceiptSchema).min(1).max(256),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.literal('ready'),
  taskId: IdentifierSchema,
}).strict().superRefine((batch, context) => {
  const filePaths = batch.receipts.map((receipt) => receipt.filePath)
  if (new Set(filePaths).size !== filePaths.length) {
    context.addIssue({ code: 'custom', message: 'Checkpoint batch file paths must be unique', path: ['receipts'] })
  }
})

export const AxisRollbackOwnerSchema = z.object({
  kind: z.literal('axis-run'),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}).strict()

export const AxisExecutionAuthorityEnvelopeSchema = z.object({
  allowedFiles: z.array(z.string().trim().min(1).max(1_024)).min(1).max(256),
  allowedTools: z.array(IdentifierSchema).min(1).max(64),
  checkpointReceipts: z.array(AxisCheckpointReceiptSchema).min(1).max(256),
  envelopeId: IdentifierSchema,
  expiresAt: TimestampSchema,
  fileFingerprintEvidence: z.array(AxisFileFingerprintEvidenceSchema).max(256),
  fileLeaseEvidence: z.array(AxisFileLeaseSchema).max(256),
  issuedAt: TimestampSchema,
  issuer: z.literal('pivot-main'),
  mode: z.enum(['fake-mutation', 'safe-write']),
  projectId: IdentifierSchema.nullable(),
  projectRoot: z.string().trim().min(1).max(1_024),
  rollbackOwner: AxisRollbackOwnerSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  signature: Sha256Schema,
  taskId: IdentifierSchema,
}).strict().superRefine((envelope, context) => {
  if (Date.parse(envelope.expiresAt) <= Date.parse(envelope.issuedAt)) {
    context.addIssue({ code: 'custom', message: 'Authority expiration must be after issuance', path: ['expiresAt'] })
  }
  if (new Set(envelope.allowedFiles).size !== envelope.allowedFiles.length) {
    context.addIssue({ code: 'custom', message: 'Allowed file capabilities must be unique', path: ['allowedFiles'] })
  }
  if (new Set(envelope.allowedTools).size !== envelope.allowedTools.length) {
    context.addIssue({ code: 'custom', message: 'Allowed tool capabilities must be unique', path: ['allowedTools'] })
  }
  const receiptFiles = envelope.checkpointReceipts.map((receipt) => receipt.filePath)
  if (new Set(receiptFiles).size !== receiptFiles.length || JSON.stringify([...receiptFiles].sort()) !== JSON.stringify([...envelope.allowedFiles].sort())) {
    context.addIssue({ code: 'custom', message: 'Every writable file capability requires exactly one checkpoint receipt', path: ['checkpointReceipts'] })
  }
  if (envelope.rollbackOwner.runId !== envelope.runId || envelope.rollbackOwner.sessionId !== envelope.sessionId) {
    context.addIssue({ code: 'custom', message: 'Rollback ownership must match the authority run and session', path: ['rollbackOwner'] })
  }
  if (envelope.mode === 'fake-mutation') {
    if (envelope.projectId || envelope.fileLeaseEvidence.length > 0 || envelope.fileFingerprintEvidence.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Fake-mutation authority cannot contain real file coordination evidence',
        path: ['fileLeaseEvidence'],
      })
    }
    return
  }
  if (!envelope.projectId) {
    context.addIssue({ code: 'custom', message: 'Safe-write authority requires a project identity', path: ['projectId'] })
  }
  if (
    envelope.fileLeaseEvidence.length !== envelope.allowedFiles.length
    || envelope.fileFingerprintEvidence.length !== envelope.allowedFiles.length
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Safe-write authority requires one Lease and Fingerprint evidence record per file',
      path: ['fileFingerprintEvidence'],
    })
  }
  const leaseIds = new Set<string>()
  const leaseFileKeys = new Set<string>()
  const fingerprintIds = new Set<string>()
  const fingerprintFileKeys = new Set<string>()
  const fingerprintsByFileKey = new Map(
    envelope.fileFingerprintEvidence.map((evidence) => [evidence.fileKey, evidence]),
  )
  for (const lease of envelope.fileLeaseEvidence) {
    leaseIds.add(lease.leaseId)
    leaseFileKeys.add(lease.fileKey)
    const fingerprint = fingerprintsByFileKey.get(lease.fileKey)
    if (
      lease.status !== 'active'
      || lease.projectId !== envelope.projectId
      || lease.runId !== envelope.runId
      || lease.sessionId !== envelope.sessionId
      || lease.taskId !== envelope.taskId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Lease evidence ownership must match safe-write authority',
        path: ['fileLeaseEvidence'],
      })
    }
    if (!fingerprint || fingerprint.projectRelativePath !== lease.projectRelativePath) {
      context.addIssue({
        code: 'custom',
        message: 'Lease and Fingerprint evidence must bind the same file identity',
        path: ['fileFingerprintEvidence'],
      })
    }
  }
  for (const fingerprint of envelope.fileFingerprintEvidence) {
    fingerprintIds.add(fingerprint.evidenceId)
    fingerprintFileKeys.add(fingerprint.fileKey)
    if (
      fingerprint.projectId !== envelope.projectId
      || fingerprint.runId !== envelope.runId
      || fingerprint.sessionId !== envelope.sessionId
      || fingerprint.taskId !== envelope.taskId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Fingerprint evidence ownership must match safe-write authority',
        path: ['fileFingerprintEvidence'],
      })
    }
  }
  if (
    leaseIds.size !== envelope.fileLeaseEvidence.length
    || leaseFileKeys.size !== envelope.fileLeaseEvidence.length
    || fingerprintIds.size !== envelope.fileFingerprintEvidence.length
    || fingerprintFileKeys.size !== envelope.fileFingerprintEvidence.length
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Safe-write coordination evidence must be unique',
      path: ['fileLeaseEvidence'],
    })
  }
  const authorityExpiry = Date.parse(envelope.expiresAt)
  if (
    envelope.fileLeaseEvidence.some((lease) => Date.parse(lease.expiresAt) < authorityExpiry)
    || envelope.fileFingerprintEvidence.some((evidence) => Date.parse(evidence.expiresAt) < authorityExpiry)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Safe-write authority cannot outlive Lease or Fingerprint evidence',
      path: ['expiresAt'],
    })
  }
})

export const AxisMutationIntentSchema = z.object({
  contentSha256: Sha256Schema,
  filePath: z.string().trim().min(1).max(1_024),
  operation: z.literal('write'),
  toolName: IdentifierSchema,
}).strict()

export const AxisSafeWriteIntentSchema = AxisMutationIntentSchema.extend({
  content: z.string().max(4 * 1_024 * 1_024),
}).strict()

export const AxisFakeMutationReceiptSchema = z.object({
  checkpointReceipt: AxisCheckpointReceiptSchema,
  envelopeId: IdentifierSchema,
  intent: AxisMutationIntentSchema,
  mode: z.literal('fake-mutation'),
  rollbackOwner: AxisRollbackOwnerSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  status: z.literal('simulated'),
  taskId: IdentifierSchema,
  timestamp: TimestampSchema,
}).strict()

export const AxisSafeWriteReceiptSchema = z.object({
  checkpointReceipt: AxisCheckpointReceiptSchema,
  contentSha256: Sha256Schema,
  envelopeId: IdentifierSchema,
  filePath: z.string().trim().min(1).max(1_024),
  mode: z.literal('safe-write'),
  rollbackOwner: AxisRollbackOwnerSchema,
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  sizeBytes: z.number().int().nonnegative().max(16 * 1_024 * 1_024),
  status: z.literal('written'),
  taskId: IdentifierSchema,
  timestamp: TimestampSchema,
  toolName: IdentifierSchema,
}).strict()

export const AxisRollbackOutcomeSchema = z.object({
  action: z.enum(['restore-checkpoint', 'delete-created-file']),
  detail: z.string().trim().min(1).max(4_000),
  filePath: z.string().trim().min(1).max(1_024),
  status: z.enum(['completed', 'failed']),
}).strict()

export const AxisExecutionTransactionSchema = z.object({
  checkpointReceipts: z.array(AxisCheckpointReceiptSchema).min(1).max(256),
  createdAt: TimestampSchema,
  projectRoot: z.string().trim().min(1).max(1_024),
  revision: z.number().int().positive(),
  rollbackOutcomes: z.array(AxisRollbackOutcomeSchema).max(256),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.enum(['prepared', 'worker-started', 'rollback-pending', 'rolling-back', 'rolled-back', 'rollback-incomplete', 'completed']),
  taskId: IdentifierSchema,
  transactionId: IdentifierSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((transaction, context) => {
  if (Date.parse(transaction.updatedAt) < Date.parse(transaction.createdAt)) {
    context.addIssue({ code: 'custom', message: 'Transaction update time cannot precede creation', path: ['updatedAt'] })
  }
  const receiptKeys = transaction.checkpointReceipts.map((receipt) => `${receipt.filePath}\u0000${receipt.rollbackAction}`)
  if (new Set(receiptKeys).size !== receiptKeys.length) {
    context.addIssue({ code: 'custom', message: 'Execution transaction checkpoint receipts must be unique', path: ['checkpointReceipts'] })
  }
  const terminalRollback = transaction.status === 'rolled-back' || transaction.status === 'rollback-incomplete'
  if (!terminalRollback && transaction.rollbackOutcomes.length > 0) {
    context.addIssue({ code: 'custom', message: 'Only terminal rollback states may contain rollback outcomes', path: ['rollbackOutcomes'] })
    return
  }
  if (!terminalRollback) return
  const outcomeKeys = transaction.rollbackOutcomes.map((outcome) => `${outcome.filePath}\u0000${outcome.action}`)
  if (transaction.rollbackOutcomes.length !== transaction.checkpointReceipts.length
    || new Set(outcomeKeys).size !== outcomeKeys.length
    || JSON.stringify([...outcomeKeys].sort()) !== JSON.stringify([...receiptKeys].sort())) {
    context.addIssue({ code: 'custom', message: 'Terminal rollback evidence must cover every checkpoint receipt exactly once', path: ['rollbackOutcomes'] })
  }
  const hasFailure = transaction.rollbackOutcomes.some((outcome) => outcome.status === 'failed')
  if (transaction.status === 'rolled-back' && hasFailure) {
    context.addIssue({ code: 'custom', message: 'Rolled-back transaction cannot contain failed outcomes', path: ['rollbackOutcomes'] })
  }
  if (transaction.status === 'rollback-incomplete' && !hasFailure) {
    context.addIssue({ code: 'custom', message: 'Incomplete rollback requires failed outcome evidence', path: ['rollbackOutcomes'] })
  }
})

export const AxisGuardedSafeWriteCompletionEvidenceSchema = z.object({
  authority: z.literal('pivot-main'),
  checkpointReceipts: z.array(AxisCheckpointReceiptSchema).min(1).max(256),
  completedAt: TimestampSchema,
  gateEvidenceIds: z.array(IdentifierSchema).min(1).max(5),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.literal('completed'),
  taskId: IdentifierSchema,
  transactionId: IdentifierSchema,
  transactionRevision: z.number().int().min(3),
  writes: z.array(z.object({
    contentSha256: Sha256Schema,
    envelopeId: IdentifierSchema,
    filePath: z.string().trim().min(1).max(1_024),
  }).strict()).min(1).max(256),
}).strict().superRefine((evidence, context) => {
  const checkpointPaths = evidence.checkpointReceipts.map((receipt) => receipt.filePath)
  if (new Set(checkpointPaths).size !== checkpointPaths.length) {
    context.addIssue({
      code: 'custom',
      message: 'Completion checkpoint file paths must be unique',
      path: ['checkpointReceipts'],
    })
  }
  if (new Set(evidence.gateEvidenceIds).size !== evidence.gateEvidenceIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Completion Gate evidence identifiers must be unique',
      path: ['gateEvidenceIds'],
    })
  }
  const writePaths = evidence.writes.map((write) => write.filePath)
  if (new Set(writePaths).size !== writePaths.length) {
    context.addIssue({
      code: 'custom',
      message: 'Completion write file paths must be unique',
      path: ['writes'],
    })
  }
})

export const AxisGuardedExecutionResultSchema = z.object({
  blockReason: z.enum(['permission-denied', 'permission-timeout', 'permission-error', 'aborted', 'checkpoint-failed', 'authority-failed']).nullable(),
  checkpointReceipts: z.array(AxisCheckpointReceiptSchema).max(256),
  detail: z.string().trim().min(1).max(8_000),
  mode: z.literal('fake-mutation'),
  mutationReceipts: z.array(AxisFakeMutationReceiptSchema).max(256),
  rollbackOutcomes: z.array(AxisRollbackOutcomeSchema).max(256),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  status: z.enum(['simulated', 'blocked', 'failed-rolled-back', 'failed-rollback-incomplete']),
  taskId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  if (result.status === 'blocked') {
    if (!result.blockReason) context.addIssue({ code: 'custom', message: 'Blocked execution requires a block reason', path: ['blockReason'] })
    if (result.mutationReceipts.length > 0 || result.rollbackOutcomes.length > 0) {
      context.addIssue({ code: 'custom', message: 'Blocked execution cannot report worker or rollback activity' })
    }
    return
  }
  if (result.blockReason) context.addIssue({ code: 'custom', message: 'Non-blocked execution cannot contain a block reason', path: ['blockReason'] })
  if (result.status === 'simulated') {
    if (result.mutationReceipts.length === 0) context.addIssue({ code: 'custom', message: 'Simulated execution requires mutation receipts', path: ['mutationReceipts'] })
    if (result.rollbackOutcomes.length > 0) context.addIssue({ code: 'custom', message: 'Successful simulation cannot contain rollback outcomes', path: ['rollbackOutcomes'] })
    return
  }
  if (result.checkpointReceipts.length === 0 || result.rollbackOutcomes.length !== result.checkpointReceipts.length) {
    context.addIssue({ code: 'custom', message: 'Failed execution requires one rollback outcome per checkpoint receipt', path: ['rollbackOutcomes'] })
  }
  const hasRollbackFailure = result.rollbackOutcomes.some((outcome) => outcome.status === 'failed')
  if (result.status === 'failed-rolled-back' && hasRollbackFailure) {
    context.addIssue({ code: 'custom', message: 'Complete rollback status cannot contain failed rollback outcomes', path: ['rollbackOutcomes'] })
  }
  if (result.status === 'failed-rollback-incomplete' && !hasRollbackFailure) {
    context.addIssue({ code: 'custom', message: 'Incomplete rollback status requires failed rollback evidence', path: ['rollbackOutcomes'] })
  }
})

export const AxisGuardedSafeWriteResultSchema = z.object({
  blockReason: z.enum([
    'feature-disabled',
    'permission-denied',
    'permission-timeout',
    'permission-error',
    'aborted',
    'checkpoint-failed',
    'lease-failed',
    'external-change',
    'authority-failed',
  ]).nullable(),
  checkpointReceipts: z.array(AxisCheckpointReceiptSchema).max(256),
  completionEvidence: AxisGuardedSafeWriteCompletionEvidenceSchema.nullable(),
  detail: z.string().trim().min(1).max(8_000),
  gateResult: AxisGateBatchResultSchema.nullable(),
  mode: z.literal('safe-write'),
  rollbackOutcomes: z.array(AxisRollbackOutcomeSchema).max(256),
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  status: z.enum(['completed', 'blocked', 'failed-rolled-back', 'failed-rollback-incomplete']),
  taskId: IdentifierSchema,
  writeReceipts: z.array(AxisSafeWriteReceiptSchema).max(256),
}).strict().superRefine((result, context) => {
  if (result.status === 'blocked') {
    if (!result.blockReason) context.addIssue({ code: 'custom', message: 'Blocked safe-write execution requires a block reason', path: ['blockReason'] })
    if (result.completionEvidence || result.gateResult || result.writeReceipts.length > 0 || result.rollbackOutcomes.length > 0) {
      context.addIssue({ code: 'custom', message: 'Blocked safe-write execution cannot report worker or rollback activity' })
    }
    return
  }
  if (result.status !== 'completed' && result.completionEvidence) {
    context.addIssue({
      code: 'custom',
      message: 'Only completed safe-write execution may contain completion evidence',
      path: ['completionEvidence'],
    })
  }
  if (result.blockReason) context.addIssue({ code: 'custom', message: 'Non-blocked safe-write execution cannot contain a block reason', path: ['blockReason'] })
  if (result.gateResult && (
    result.gateResult.runId !== result.runId
    || result.gateResult.sessionId !== result.sessionId
    || result.gateResult.taskId !== result.taskId
  )) {
    context.addIssue({ code: 'custom', message: 'Safe-write Gate ownership must match the execution result', path: ['gateResult'] })
  }
  if (result.status === 'completed') {
    if (!result.completionEvidence) {
      context.addIssue({ code: 'custom', message: 'Completed safe-write execution requires durable completion evidence', path: ['completionEvidence'] })
    } else {
      const completion = result.completionEvidence
      if (
        completion.runId !== result.runId
        || completion.sessionId !== result.sessionId
        || completion.taskId !== result.taskId
      ) {
        context.addIssue({ code: 'custom', message: 'Completion evidence ownership must match the safe-write result', path: ['completionEvidence'] })
      }
      if (JSON.stringify(completion.checkpointReceipts) !== JSON.stringify(result.checkpointReceipts)) {
        context.addIssue({ code: 'custom', message: 'Completion evidence must bind the exact checkpoint receipts', path: ['completionEvidence', 'checkpointReceipts'] })
      }
      if (!result.gateResult || JSON.stringify(completion.gateEvidenceIds) !== JSON.stringify(result.gateResult.evidenceIds)) {
        context.addIssue({ code: 'custom', message: 'Completion evidence must bind the exact Gate evidence identifiers', path: ['completionEvidence', 'gateEvidenceIds'] })
      }
      const writes = result.writeReceipts.map(({ contentSha256, envelopeId, filePath }) => ({
        contentSha256,
        envelopeId,
        filePath,
      }))
      if (JSON.stringify(completion.writes) !== JSON.stringify(writes)) {
        context.addIssue({ code: 'custom', message: 'Completion evidence must bind the exact write receipts', path: ['completionEvidence', 'writes'] })
      }
    }
    if (result.writeReceipts.length === 0) context.addIssue({ code: 'custom', message: 'Completed safe-write execution requires write receipts', path: ['writeReceipts'] })
    if (result.rollbackOutcomes.length > 0) context.addIssue({ code: 'custom', message: 'Completed safe-write execution cannot contain rollback outcomes', path: ['rollbackOutcomes'] })
    if (!result.gateResult || result.gateResult.status !== 'passed') {
      context.addIssue({ code: 'custom', message: 'Completed safe-write execution requires passed Gate 1 evidence', path: ['gateResult'] })
    }
    return
  }
  if (result.checkpointReceipts.length === 0 || result.rollbackOutcomes.length !== result.checkpointReceipts.length) {
    context.addIssue({ code: 'custom', message: 'Failed safe-write execution requires one rollback outcome per checkpoint receipt', path: ['rollbackOutcomes'] })
  }
  const hasRollbackFailure = result.rollbackOutcomes.some((outcome) => outcome.status === 'failed')
  if (result.status === 'failed-rolled-back' && hasRollbackFailure) {
    context.addIssue({ code: 'custom', message: 'Complete safe-write rollback cannot contain failed outcomes', path: ['rollbackOutcomes'] })
  }
  if (result.status === 'failed-rollback-incomplete' && !hasRollbackFailure) {
    context.addIssue({ code: 'custom', message: 'Incomplete safe-write rollback requires failed outcome evidence', path: ['rollbackOutcomes'] })
  }
})

const AxisAuthorityAuditBaseSchema = z.object({
  entryId: IdentifierSchema,
  recordedAt: TimestampSchema,
  runId: IdentifierSchema,
  sequence: z.number().int().positive(),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict()

export const AxisAuthorityAuditEntrySchema = z.discriminatedUnion('type', [
  AxisAuthorityAuditBaseSchema.extend({ envelope: AxisExecutionAuthorityEnvelopeSchema, type: z.literal('authority-issued') }).strict(),
  AxisAuthorityAuditBaseSchema.extend({ receipt: AxisFakeMutationReceiptSchema, type: z.literal('mutation-simulated') }).strict(),
  AxisAuthorityAuditBaseSchema.extend({ receipt: AxisSafeWriteReceiptSchema, type: z.literal('mutation-written') }).strict(),
]).superRefine((entry, context) => {
  const payload = entry.type === 'authority-issued' ? entry.envelope : entry.receipt
  if (payload.runId !== entry.runId || payload.sessionId !== entry.sessionId || payload.taskId !== entry.taskId) {
    context.addIssue({ code: 'custom', message: 'Authority audit payload ownership must match its entry' })
  }
})

export type AxisCheckpointReceipt = z.infer<typeof AxisCheckpointReceiptSchema>
export type AxisExecutionGrant = z.infer<typeof AxisExecutionGrantSchema>
export type AxisCheckpointReceiptBatch = z.infer<typeof AxisCheckpointReceiptBatchSchema>
export type AxisRollbackOwner = z.infer<typeof AxisRollbackOwnerSchema>
export type AxisExecutionAuthorityEnvelope = z.infer<typeof AxisExecutionAuthorityEnvelopeSchema>
export type AxisMutationIntent = z.infer<typeof AxisMutationIntentSchema>
export type AxisSafeWriteIntent = z.infer<typeof AxisSafeWriteIntentSchema>
export type AxisFakeMutationReceipt = z.infer<typeof AxisFakeMutationReceiptSchema>
export type AxisSafeWriteReceipt = z.infer<typeof AxisSafeWriteReceiptSchema>
export type AxisRollbackOutcome = z.infer<typeof AxisRollbackOutcomeSchema>
export type AxisExecutionTransaction = z.infer<typeof AxisExecutionTransactionSchema>
export type AxisGuardedSafeWriteCompletionEvidence = z.infer<typeof AxisGuardedSafeWriteCompletionEvidenceSchema>
export type AxisGuardedExecutionResult = z.infer<typeof AxisGuardedExecutionResultSchema>
export type AxisGuardedSafeWriteResult = z.infer<typeof AxisGuardedSafeWriteResultSchema>
export type AxisAuthorityAuditEntry = z.infer<typeof AxisAuthorityAuditEntrySchema>
