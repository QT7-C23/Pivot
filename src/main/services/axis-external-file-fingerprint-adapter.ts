import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import {
  AxisFileFingerprintCaptureRequestSchema,
  AxisFileFingerprintEvidenceSchema,
  AxisFileFingerprintVerificationBatchSchema,
  AxisFileFingerprintVerifyRequestSchema,
  type AxisFileFingerprintCaptureRequest,
  type AxisFileFingerprintEvidence,
  type AxisFileFingerprintState,
  type AxisFileFingerprintVerification,
  type AxisFileFingerprintVerificationBatch,
  type AxisFileFingerprintVerifyRequest,
} from '../../shared/axis-file-fingerprint-contracts'
import {
  AxisFileIdentitySchema,
  AxisFileLeaseBindingSchema,
  type AxisFileIdentity,
  type AxisFileLeaseBinding,
} from '../../shared/axis-file-lease-contracts'
import {
  AxisFileFingerprintOwnershipError,
  AxisFileFingerprintProofError,
  AxisFileFingerprintUnstableReadError,
  type AxisFileFingerprintPortFactory,
  type AxisTaskFileFingerprintPort,
} from './axis-file-fingerprint-ports'
import type { AxisProjectFileIdentityPort } from './axis-file-lease-ports'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import { resolvePathWithinRoot } from './file-system'

const DEFAULT_EVIDENCE_TTL_MS = 60_000
const MIN_EVIDENCE_TTL_MS = 1_000
const MAX_EVIDENCE_TTL_MS = 5 * 60_000
const READ_BUFFER_BYTES = 64 * 1_024

type FingerprintAdapterOptions = {
  clock?: () => Date
  evidenceTtlMs?: number
  identity: AxisProjectFileIdentityPort
  projectBindings: AxisProjectBindingReaderPort
  proofSecret?: Uint8Array
}

type CurrentFingerprint = {
  identity: AxisFileIdentity
  state: AxisFileFingerprintState
}

type FileStats = BigIntStats

export class AxisExternalFileFingerprintAdapter implements AxisFileFingerprintPortFactory {
  private readonly clock: () => Date
  private readonly evidenceTtlMs: number
  private readonly identity: AxisProjectFileIdentityPort
  private readonly projectBindings: AxisProjectBindingReaderPort
  private readonly proofSecret: Buffer

  constructor(options: FingerprintAdapterOptions) {
    this.clock = options.clock ?? (() => new Date())
    this.evidenceTtlMs = validateEvidenceTtl(options.evidenceTtlMs ?? DEFAULT_EVIDENCE_TTL_MS)
    this.identity = options.identity
    this.projectBindings = options.projectBindings
    const proofSecret = options.proofSecret ?? randomBytes(32)
    if (proofSecret.byteLength < 32) {
      throw new Error('File fingerprint proof secret must contain at least 32 bytes')
    }
    this.proofSecret = Buffer.from(proofSecret)
  }

  openTaskPort(bindingInput: AxisFileLeaseBinding): AxisTaskFileFingerprintPort {
    const binding = AxisFileLeaseBindingSchema.parse(bindingInput)
    return Object.freeze({
      captureAll: (request: AxisFileFingerprintCaptureRequest) => this.captureAll(binding, request),
      verifyAll: (request: AxisFileFingerprintVerifyRequest) => this.verifyAll(binding, request),
    })
  }

  private async captureAll(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileFingerprintCaptureRequest,
  ): Promise<AxisFileFingerprintEvidence[]> {
    const request = AxisFileFingerprintCaptureRequestSchema.parse(requestInput)
    const resolved = await Promise.all(request.filePaths.map(
      (filePath) => this.captureCurrent(binding, filePath),
    ))
    const current = [...new Map(
      resolved.map((item) => [item.identity.fileKey, item]),
    ).values()].sort(
      (left, right) => left.identity.projectRelativePath.localeCompare(
        right.identity.projectRelativePath,
      ),
    )
    const capturedAt = this.clock().toISOString()
    const expiresAt = new Date(Date.parse(capturedAt) + this.evidenceTtlMs).toISOString()

    return current.map(({ identity, state }) => {
      const unsigned = {
        ...binding,
        capturedAt,
        evidenceId: `file-fingerprint-${randomUUID()}`,
        expiresAt,
        fileKey: identity.fileKey,
        projectRelativePath: identity.projectRelativePath,
        schemaVersion: 1 as const,
        state,
      }
      return AxisFileFingerprintEvidenceSchema.parse({
        ...unsigned,
        proof: this.sign(unsigned),
      })
    })
  }

  private async verifyAll(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileFingerprintVerifyRequest,
  ): Promise<AxisFileFingerprintVerificationBatch> {
    const request = AxisFileFingerprintVerifyRequestSchema.parse(requestInput)
    for (const evidence of request.evidence) {
      this.verifyProof(evidence)
      if (!sameBinding(binding, evidence)) {
        throw new AxisFileFingerprintOwnershipError()
      }
    }

    const checkedAt = this.clock().toISOString()
    const evidence = [...request.evidence].sort(
      (left, right) => left.projectRelativePath.localeCompare(right.projectRelativePath),
    )
    const results: AxisFileFingerprintVerification[] = []
    for (const item of evidence) {
      if (Date.parse(checkedAt) >= Date.parse(item.expiresAt)) {
        results.push(rejectedResult(item, checkedAt, 'stale'))
        continue
      }
      const current = await this.captureCurrent(binding, item.projectRelativePath)
      results.push(compareEvidence(item, current, checkedAt))
    }

    return AxisFileFingerprintVerificationBatchSchema.parse({
      results,
      schemaVersion: 1,
      status: results.every((result) => result.status === 'matched') ? 'matched' : 'rejected',
    })
  }

  private async captureCurrent(
    binding: AxisFileLeaseBinding,
    filePath: string,
  ): Promise<CurrentFingerprint> {
    const identity = AxisFileIdentitySchema.parse(await this.identity.resolve(binding, filePath))
    const projectBinding = this.projectBindings.findBySession(binding.sessionId)
    if (!projectBinding) {
      throw new Error(`Unknown authoritative session project root: ${binding.sessionId}`)
    }
    if (projectBinding.projectId !== binding.projectId) {
      throw new AxisFileFingerprintOwnershipError()
    }
    const projectRoot = await resolvePathWithinRoot(
      projectBinding.projectRoot,
      projectBinding.projectRoot,
    )
    const candidate = path.join(projectRoot, identity.projectRelativePath)
    const resolved = await resolvePathWithinRoot(projectRoot, candidate, { allowMissingLeaf: true })
    return {
      identity,
      state: await captureFileState(resolved, identity.projectRelativePath),
    }
  }

  private sign(evidence: Omit<AxisFileFingerprintEvidence, 'proof'>): string {
    return createHmac('sha256', this.proofSecret)
      .update(proofPayload(evidence), 'utf8')
      .digest('base64url')
  }

  private verifyProof(evidence: AxisFileFingerprintEvidence): void {
    const { proof, ...unsigned } = evidence
    const expected = Buffer.from(this.sign(unsigned), 'base64url')
    const actual = Buffer.from(proof, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AxisFileFingerprintProofError()
    }
  }
}

async function captureFileState(
  absolutePath: string,
  projectRelativePath: string,
): Promise<AxisFileFingerprintState> {
  let handle: FileHandle
  try {
    handle = await open(absolutePath, 'r')
  } catch (error) {
    if (isNotFoundError(error)) return { kind: 'missing' }
    throw error
  }

  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile()) {
      throw new Error(`File fingerprint requires a regular file: ${projectRelativePath}`)
    }
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`File is too large to fingerprint safely: ${projectRelativePath}`)
    }

    const contentHash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
    let byteLength = 0
    while (true) {
      const read = await handle.read(buffer, 0, buffer.length, byteLength)
      if (read.bytesRead === 0) break
      contentHash.update(buffer.subarray(0, read.bytesRead))
      byteLength += read.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    if (!sameFileStats(before, after) || BigInt(byteLength) !== before.size) {
      throw new AxisFileFingerprintUnstableReadError(projectRelativePath)
    }

    return {
      byteLength,
      contentSha256: contentHash.digest('hex'),
      fileInstanceSha256: fileInstanceDigest(after),
      kind: 'exists',
    }
  } finally {
    await handle.close()
  }
}

function compareEvidence(
  evidence: AxisFileFingerprintEvidence,
  current: CurrentFingerprint,
  checkedAt: string,
): AxisFileFingerprintVerification {
  if (evidence.state.kind === 'exists' && current.state.kind === 'missing') {
    return rejectedResult(evidence, checkedAt, 'deleted')
  }
  if (evidence.state.kind === 'missing' && current.state.kind === 'exists') {
    return rejectedResult(evidence, checkedAt, 'created')
  }
  if (evidence.state.kind === 'missing' && current.state.kind === 'missing') {
    return matchedResult(evidence, checkedAt)
  }
  if (evidence.state.kind !== 'exists' || current.state.kind !== 'exists') {
    throw new Error('Unsupported file fingerprint state comparison')
  }
  if (
    current.identity.fileKey !== evidence.fileKey
    || current.state.fileInstanceSha256 !== evidence.state.fileInstanceSha256
  ) {
    return rejectedResult(evidence, checkedAt, 'replaced')
  }
  if (
    current.state.byteLength !== evidence.state.byteLength
    || current.state.contentSha256 !== evidence.state.contentSha256
  ) {
    return rejectedResult(evidence, checkedAt, 'modified')
  }
  return matchedResult(evidence, checkedAt)
}

function matchedResult(
  evidence: AxisFileFingerprintEvidence,
  checkedAt: string,
): AxisFileFingerprintVerification {
  return {
    checkedAt,
    evidenceId: evidence.evidenceId,
    fileKey: evidence.fileKey,
    projectRelativePath: evidence.projectRelativePath,
    reason: null,
    status: 'matched',
  }
}

function rejectedResult(
  evidence: AxisFileFingerprintEvidence,
  checkedAt: string,
  reason: 'created' | 'deleted' | 'modified' | 'replaced' | 'stale',
): AxisFileFingerprintVerification {
  return {
    checkedAt,
    evidenceId: evidence.evidenceId,
    fileKey: evidence.fileKey,
    projectRelativePath: evidence.projectRelativePath,
    reason,
    status: 'rejected',
  }
}

function proofPayload(evidence: Omit<AxisFileFingerprintEvidence, 'proof'>): string {
  return JSON.stringify({
    capturedAt: evidence.capturedAt,
    evidenceId: evidence.evidenceId,
    expiresAt: evidence.expiresAt,
    fileKey: evidence.fileKey,
    projectId: evidence.projectId,
    projectRelativePath: evidence.projectRelativePath,
    runId: evidence.runId,
    schemaVersion: evidence.schemaVersion,
    sessionId: evidence.sessionId,
    state: evidence.state,
    taskId: evidence.taskId,
  })
}

function sameBinding(
  binding: AxisFileLeaseBinding,
  evidence: AxisFileFingerprintEvidence,
): boolean {
  return binding.projectId === evidence.projectId
    && binding.runId === evidence.runId
    && binding.sessionId === evidence.sessionId
    && binding.taskId === evidence.taskId
}

function sameFileStats(left: FileStats, right: FileStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function fileInstanceDigest(stats: FileStats): string {
  return createHash('sha256')
    .update(`${stats.dev}:${stats.ino}:${stats.birthtimeNs}`, 'utf8')
    .digest('hex')
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function validateEvidenceTtl(value: number): number {
  if (
    !Number.isInteger(value)
    || value < MIN_EVIDENCE_TTL_MS
    || value > MAX_EVIDENCE_TTL_MS
  ) {
    throw new Error(
      `File fingerprint evidence TTL must be between ${MIN_EVIDENCE_TTL_MS} and ${MAX_EVIDENCE_TTL_MS} milliseconds`,
    )
  }
  return value
}
