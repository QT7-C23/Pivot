import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import {
  AxisFileFingerprintEvidenceSchema,
  type AxisFileFingerprintEvidence,
} from '../../shared/axis-file-fingerprint-contracts'
import {
  AxisFileLeaseSchema,
  type AxisFileLease,
} from '../../shared/axis-file-lease-contracts'
import {
  AxisCheckpointReceiptSchema,
  AxisExecutionAuthorityEnvelopeSchema,
  AxisTaskSchema,
  type AxisCheckpointReceipt,
  type AxisExecutionAuthorityEnvelope,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import { resolvePathWithinRoot, resolveProjectPathWithinRoot } from './file-system'
import type { AxisAuthorityAuditPort } from './axis-authority-audit-registry'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'

export interface AxisAuthorityIssueRequest {
  checkpointReceipts: AxisCheckpointReceipt[]
  fileFingerprintEvidence?: AxisFileFingerprintEvidence[]
  fileLeaseEvidence?: AxisFileLease[]
  grantedFilePaths: string[]
  grantedTools: string[]
  mode?: AxisExecutionAuthorityEnvelope['mode']
  projectId?: string
  projectRoot: string
  runId: string
  sessionId: string
  task: AxisTask
}

export interface AxisAuthorityBinding {
  projectRoot: string
  runId: string
  sessionId: string
  taskId: string
}

export interface AxisAuthorityVerifier {
  canonicalizeFile(projectRoot: string, filePath: string): Promise<string>
  verify(envelope: AxisExecutionAuthorityEnvelope, binding: AxisAuthorityBinding): Promise<AxisExecutionAuthorityEnvelope>
}

const DEFAULT_TTL_MS = 60_000

export class AxisExecutionAuthorityService implements AxisAuthorityVerifier {
  private readonly audit?: AxisAuthorityAuditPort
  private readonly clock: () => Date
  private readonly projectBindings: AxisProjectBindingReaderPort
  private readonly realExecutionEnabled: () => boolean
  private readonly secret: Buffer
  private readonly ttlMs: number

  constructor(options: {
    audit?: AxisAuthorityAuditPort
    clock?: () => Date
    projectBindings: AxisProjectBindingReaderPort
    realExecutionEnabled?: () => boolean
    secret: string | Uint8Array
    ttlMs?: number
  }) {
    this.audit = options.audit
    this.clock = options.clock ?? (() => new Date())
    this.projectBindings = options.projectBindings
    this.realExecutionEnabled = options.realExecutionEnabled ?? (() => false)
    this.secret = Buffer.from(options.secret)
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    if (this.secret.byteLength < 32) throw new Error('Axis authority signing secret must contain at least 32 bytes')
    if (!Number.isInteger(this.ttlMs) || this.ttlMs < 1 || this.ttlMs > 5 * 60_000) throw new Error('Axis authority TTL must be between 1 ms and 5 minutes')
  }

  async issue(input: AxisAuthorityIssueRequest): Promise<AxisExecutionAuthorityEnvelope> {
    const task = AxisTaskSchema.parse(input.task)
    if (input.mode === 'safe-write' && !this.realExecutionEnabled()) {
      throw new Error('Axis real file execution is disabled; safe-write authority cannot be issued')
    }
    const projectBinding = this.projectBindings.findBySession(input.sessionId)
    if (!projectBinding) throw new Error(`Unknown authoritative session project root: ${input.sessionId}`)
    if (input.mode === 'safe-write' && input.projectId !== projectBinding.projectId) {
      throw new Error('Safe-write authority project identity does not match the authoritative session binding')
    }
    const projectRoot = await resolvePathWithinRoot(
      projectBinding.projectRoot,
      projectBinding.projectRoot,
    )
    const requestedRoot = await resolvePathWithinRoot(input.projectRoot, input.projectRoot)
    if (projectRoot !== requestedRoot) throw new Error('Authority request project root does not match the authoritative session binding')
    const taskFiles = await Promise.all(task.assignedFiles.map((filePath) => this.canonicalizeFile(projectRoot, filePath)))
    const allowedFiles = await Promise.all(unique(input.grantedFilePaths, 'Granted file capabilities').map((filePath) => this.canonicalizeFile(projectRoot, filePath)))
    const allowedTools = unique(input.grantedTools, 'Granted tool capabilities')
    if (allowedTools.some((tool) => !task.requiredTools.includes(tool))) throw new Error('Granted capability is outside the task tool scope')
    if (allowedFiles.some((filePath) => !taskFiles.includes(filePath))) throw new Error('Granted capability is outside the task file scope')
    if (allowedFiles.length === 0 || allowedTools.length === 0) throw new Error('Mutation authority requires at least one tool and file capability')
    const checkpointReceipts = await Promise.all(input.checkpointReceipts.map(async (candidate) => {
      const receipt = AxisCheckpointReceiptSchema.parse(candidate)
      return AxisCheckpointReceiptSchema.parse({ ...receipt, filePath: await this.canonicalizeFile(projectRoot, receipt.filePath) })
    }))
    if (!sameValues(checkpointReceipts.map((receipt) => receipt.filePath), allowedFiles)) {
      throw new Error('Every writable file capability requires exactly one checkpoint receipt')
    }

    const issuedAt = this.clock()
    const mode = input.mode ?? 'fake-mutation'
    const fileLeaseEvidence = (input.fileLeaseEvidence ?? []).map((evidence) => (
      AxisFileLeaseSchema.parse(evidence)
    ))
    const fileFingerprintEvidence = (input.fileFingerprintEvidence ?? []).map((evidence) => (
      AxisFileFingerprintEvidenceSchema.parse(evidence)
    ))
    const projectId = input.projectId ?? null
    validateFileCoordinationEvidence({
      allowedFiles,
      checkpointReceipts,
      fileFingerprintEvidence,
      fileLeaseEvidence,
      issuedAt,
      mode,
      projectId,
      projectRoot,
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: task.id,
    })
    const evidenceExpiry = mode === 'safe-write'
      ? Math.min(
          ...fileLeaseEvidence.map((evidence) => Date.parse(evidence.expiresAt)),
          ...fileFingerprintEvidence.map((evidence) => Date.parse(evidence.expiresAt)),
        )
      : Number.POSITIVE_INFINITY
    const expiresAt = Math.min(issuedAt.getTime() + this.ttlMs, evidenceExpiry)
    if (expiresAt <= issuedAt.getTime()) {
      throw new Error('Safe-write coordination evidence has expired before authority issuance')
    }
    const unsigned = {
      allowedFiles,
      allowedTools,
      checkpointReceipts,
      envelopeId: `authority-${randomUUID()}`,
      expiresAt: new Date(expiresAt).toISOString(),
      fileFingerprintEvidence,
      fileLeaseEvidence,
      issuedAt: issuedAt.toISOString(),
      issuer: 'pivot-main' as const,
      mode,
      projectId,
      projectRoot,
      rollbackOwner: { kind: 'axis-run' as const, runId: input.runId, sessionId: input.sessionId },
      runId: input.runId,
      schemaVersion: 1 as const,
      sessionId: input.sessionId,
      taskId: task.id,
    }
    const envelope = AxisExecutionAuthorityEnvelopeSchema.parse({ ...unsigned, signature: this.sign(unsigned) })
    this.audit?.recordIssued(envelope)
    return envelope
  }

  async verify(envelopeInput: AxisExecutionAuthorityEnvelope, binding: AxisAuthorityBinding): Promise<AxisExecutionAuthorityEnvelope> {
    const envelope = AxisExecutionAuthorityEnvelopeSchema.parse(envelopeInput)
    const { signature, ...unsigned } = envelope
    const expectedSignature = this.sign(unsigned)
    if (!safeSignatureEqual(signature, expectedSignature)) throw new Error('Axis authority signature is invalid')
    const now = this.clock().getTime()
    if (now < Date.parse(envelope.issuedAt)) throw new Error('Axis authority envelope is not valid yet')
    if (now >= Date.parse(envelope.expiresAt)) throw new Error('Axis authority envelope has expired')
    const projectRoot = await resolvePathWithinRoot(binding.projectRoot, binding.projectRoot)
    if (envelope.runId !== binding.runId || envelope.sessionId !== binding.sessionId || envelope.taskId !== binding.taskId || envelope.projectRoot !== projectRoot) {
      throw new Error('Axis authority binding does not match the authoritative run, session, task, and project')
    }
    return envelope
  }

  canonicalizeFile(projectRoot: string, filePath: string): Promise<string> {
    return resolveProjectPathWithinRoot(projectRoot, filePath, { allowMissingLeaf: true })
  }

  private sign(value: object): string {
    return createHmac('sha256', this.secret).update(JSON.stringify(value)).digest('hex')
  }
}

function unique(values: string[], label: string): string[] {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
  return [...values]
}

function sameValues(left: string[], right: string[]): boolean {
  return new Set(left).size === left.length && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

function safeSignatureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
}

function validateFileCoordinationEvidence(input: {
  allowedFiles: string[]
  checkpointReceipts: AxisCheckpointReceipt[]
  fileFingerprintEvidence: AxisFileFingerprintEvidence[]
  fileLeaseEvidence: AxisFileLease[]
  issuedAt: Date
  mode: AxisExecutionAuthorityEnvelope['mode']
  projectId: string | null
  projectRoot: string
  runId: string
  sessionId: string
  taskId: string
}): void {
  if (input.mode === 'fake-mutation') {
    if (input.projectId || input.fileLeaseEvidence.length > 0 || input.fileFingerprintEvidence.length > 0) {
      throw new Error('Fake-mutation authority cannot bind real file coordination evidence')
    }
    return
  }
  if (!input.projectId) {
    throw new Error('Safe-write authority requires a project identity')
  }
  if (
    input.fileLeaseEvidence.length !== input.allowedFiles.length
    || input.fileFingerprintEvidence.length !== input.allowedFiles.length
  ) {
    throw new Error('Safe-write authority requires one Lease and Fingerprint evidence record per file')
  }
  const expectedPaths = input.allowedFiles.map((filePath) => projectRelativePath(
    input.projectRoot,
    filePath,
  ))
  if (
    !sameValues(input.fileLeaseEvidence.map((evidence) => evidence.projectRelativePath), expectedPaths)
    || !sameValues(
      input.fileFingerprintEvidence.map((evidence) => evidence.projectRelativePath),
      expectedPaths,
    )
  ) {
    throw new Error('Safe-write coordination evidence must exactly cover allowed files')
  }
  const fingerprintsByFileKey = new Map(
    input.fileFingerprintEvidence.map((evidence) => [evidence.fileKey, evidence]),
  )
  const receiptsByPath = new Map(input.checkpointReceipts.map((receipt) => [
    projectRelativePath(input.projectRoot, receipt.filePath),
    receipt,
  ]))
  for (const lease of input.fileLeaseEvidence) {
    const fingerprint = fingerprintsByFileKey.get(lease.fileKey)
    if (
      lease.status !== 'active'
      || lease.projectId !== input.projectId
      || lease.runId !== input.runId
      || lease.sessionId !== input.sessionId
      || lease.taskId !== input.taskId
    ) {
      throw new Error('Lease evidence ownership does not match safe-write authority')
    }
    if (!fingerprint || fingerprint.projectRelativePath !== lease.projectRelativePath) {
      throw new Error('Lease and Fingerprint evidence do not bind the same file identity')
    }
    if (Date.parse(lease.expiresAt) <= input.issuedAt.getTime()) {
      throw new Error('Safe-write Lease evidence is already expired')
    }
  }
  for (const fingerprint of input.fileFingerprintEvidence) {
    if (
      fingerprint.projectId !== input.projectId
      || fingerprint.runId !== input.runId
      || fingerprint.sessionId !== input.sessionId
      || fingerprint.taskId !== input.taskId
    ) {
      throw new Error('Fingerprint evidence ownership does not match safe-write authority')
    }
    if (Date.parse(fingerprint.expiresAt) <= input.issuedAt.getTime()) {
      throw new Error('Safe-write Fingerprint evidence is already expired')
    }
    const receipt = receiptsByPath.get(fingerprint.projectRelativePath)
    const expectedPriorState = fingerprint.state.kind === 'exists'
      ? 'existing-file'
      : 'new-file'
    if (!receipt || receipt.priorState !== expectedPriorState) {
      throw new Error('Checkpoint prior state does not match signed Fingerprint evidence')
    }
  }
}

function projectRelativePath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).replaceAll('\\', '/')
}
