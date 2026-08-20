import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { AxisProjectBindingSchema } from '../../shared/axis-project-binding-contracts'
import {
  AxisReviewedSafeWriteReceiptSchema,
  type AxisReviewedSafeWriteReceipt,
  type AxisReviewedSafeWriteReceiptFile,
} from '../../shared/axis-reviewed-proposal-contracts'
import {
  AxisSafeWriteProposalSchema,
  type AxisSafeWriteProposal,
} from '../../shared/axis-safe-write-proposal-contracts'
import type {
  AxisFileFingerprintPortFactory,
} from './axis-file-fingerprint-ports'
import type { AxisProjectFileIdentityPort } from './axis-file-lease-ports'
import type {
  AxisReviewedProposalBaseline,
  AxisReviewedProposalReceiptIssuerPort,
  AxisReviewedProposalReceiptVerifierPort,
  AxisVerifiedReviewedProposal,
} from './axis-reviewed-proposal-ports'

const DEFAULT_TTL_MS = 60_000

export class AxisReviewedProposalReceiptService
implements AxisReviewedProposalReceiptIssuerPort,
AxisReviewedProposalReceiptVerifierPort {
  private readonly clock: () => Date
  private readonly fingerprints: AxisFileFingerprintPortFactory
  private readonly idFactory: () => string
  private readonly identity: AxisProjectFileIdentityPort
  private readonly secret: Buffer
  private readonly ttlMs: number

  constructor(options: {
    clock?: () => Date
    fingerprints: AxisFileFingerprintPortFactory
    idFactory?: () => string
    identity: AxisProjectFileIdentityPort
    secret: string | Uint8Array
    ttlMs?: number
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.fingerprints = options.fingerprints
    this.idFactory = options.idFactory ?? (() => `reviewed-proposal-${randomUUID()}`)
    this.identity = options.identity
    this.secret = Buffer.from(options.secret)
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    if (this.secret.byteLength < 32) {
      throw new Error('Axis reviewed proposal signing secret must contain at least 32 bytes')
    }
    if (
      !Number.isInteger(this.ttlMs)
      || this.ttlMs < 1
      || this.ttlMs > 5 * 60_000
    ) {
      throw new Error('Axis reviewed proposal TTL must be between 1 ms and 5 minutes')
    }
  }

  async capture(
    input: Parameters<AxisReviewedProposalReceiptIssuerPort['capture']>[0],
  ): Promise<AxisReviewedProposalBaseline> {
    const project = AxisProjectBindingSchema.parse(input.project)
    if (project.sessionId !== input.sessionId) {
      throw new Error('Axis reviewed proposal project binding does not match the session')
    }
    if (
      input.filePaths.length < 1
      || input.filePaths.length > 16
      || new Set(input.filePaths).size !== input.filePaths.length
    ) {
      throw new Error('Axis reviewed proposal requires 1–16 unique files')
    }
    const binding = {
      projectId: project.projectId,
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: input.taskId,
    }
    const [evidence, identities] = await Promise.all([
      this.fingerprints.openTaskPort(binding).captureAll({
        filePaths: input.filePaths,
      }),
      Promise.all(input.filePaths.map(async (filePath) => ({
        filePath,
        identity: await this.identity.resolve(binding, filePath),
      }))),
    ])
    const evidenceByKey = new Map(evidence.map((item) => [item.fileKey, item]))
    const files = identities.map(({ filePath, identity }) => {
      const match = evidenceByKey.get(identity.fileKey)
      if (
        !match
        || match.projectRelativePath !== identity.projectRelativePath
      ) {
        throw new Error(
          `Axis reviewed proposal fingerprint identity mismatch: ${filePath}`,
        )
      }
      return { evidence: match, filePath }
    })
    if (files.length !== evidence.length) {
      throw new Error('Axis reviewed proposal fingerprint set must exactly match assigned files')
    }
    return {
      files,
      projectId: project.projectId,
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: input.taskId,
    }
  }

  async issue(
    input: Parameters<AxisReviewedProposalReceiptIssuerPort['issue']>[0],
  ): Promise<AxisReviewedSafeWriteReceipt> {
    const proposal = AxisSafeWriteProposalSchema.parse(input.proposal)
    const baseline = input.baseline
    assertBinding(baseline, proposal)
    const fingerprintPort = this.fingerprints.openTaskPort({
      projectId: baseline.projectId,
      runId: baseline.runId,
      sessionId: baseline.sessionId,
      taskId: baseline.taskId,
    })
    const verification = await fingerprintPort.verifyAll({
      evidence: baseline.files.map((file) => file.evidence),
    })
    if (verification.status === 'rejected') {
      throw new Error('Axis reviewed proposal baseline changed before receipt issuance')
    }
    const baselineByPath = new Map(
      baseline.files.map((file) => [file.filePath, file.evidence]),
    )
    const files: AxisReviewedSafeWriteReceiptFile[] = proposal.files.map((file) => {
      const evidence = baselineByPath.get(file.filePath)
      if (!evidence) {
        throw new Error(`Axis reviewed proposal baseline is missing: ${file.filePath}`)
      }
      assertProposalOriginalMatchesEvidence(file, evidence.state)
      return {
        fileKey: evidence.fileKey,
        filePath: file.filePath,
        projectRelativePath: evidence.projectRelativePath,
        proposedContentSha256: sha256(file.proposedContent),
        state: evidence.state,
      }
    })
    if (files.length !== baseline.files.length) {
      throw new Error('Axis reviewed proposal receipt files must exactly match the baseline')
    }
    const issuedAt = this.clock()
    const evidenceExpiry = Math.min(
      ...baseline.files.map((file) => Date.parse(file.evidence.expiresAt)),
    )
    const expiresAt = Math.min(
      issuedAt.getTime() + this.ttlMs,
      evidenceExpiry,
    )
    if (expiresAt <= issuedAt.getTime()) {
      throw new Error('Axis reviewed proposal fingerprint evidence expired before receipt issuance')
    }
    const unsigned = {
      expectedRevision: proposal.expectedRevision,
      expiresAt: new Date(expiresAt).toISOString(),
      files,
      issuedAt: issuedAt.toISOString(),
      issuer: 'pivot-main' as const,
      projectId: baseline.projectId,
      proposalId: proposal.proposalId,
      receiptId: this.idFactory(),
      runId: proposal.runId,
      schemaVersion: 1 as const,
      sessionId: proposal.sessionId,
      taskId: proposal.taskId,
    }
    return AxisReviewedSafeWriteReceiptSchema.parse({
      ...unsigned,
      signature: this.sign(unsigned),
    })
  }

  async verify(
    input: Parameters<AxisReviewedProposalReceiptVerifierPort['verify']>[0],
  ): Promise<AxisVerifiedReviewedProposal> {
    const project = AxisProjectBindingSchema.parse(input.project)
    const receipt = AxisReviewedSafeWriteReceiptSchema.parse(input.receipt)
    const { signature, ...unsigned } = receipt
    if (!safeSignatureEqual(signature, this.sign(unsigned))) {
      throw new Error('Axis reviewed proposal receipt signature is invalid')
    }
    const now = this.clock().getTime()
    if (now < Date.parse(receipt.issuedAt)) {
      throw new Error('Axis reviewed proposal receipt is not valid yet')
    }
    if (now >= Date.parse(receipt.expiresAt)) {
      throw new Error('Axis reviewed proposal receipt has expired')
    }
    if (
      receipt.projectId !== project.projectId
      || receipt.runId !== input.runId
      || receipt.sessionId !== input.sessionId
      || receipt.taskId !== input.taskId
      || project.sessionId !== input.sessionId
    ) {
      throw new Error('Axis reviewed proposal receipt binding does not match the authoritative request')
    }
    if (
      receipt.expectedRevision !== input.expectedRevision
    ) {
      throw new Error('Axis reviewed proposal receipt revision does not match the submission')
    }
    assertWritesMatchReceipt(input.writes, receipt.files)
    const binding = {
      projectId: receipt.projectId,
      runId: receipt.runId,
      sessionId: receipt.sessionId,
      taskId: receipt.taskId,
    }
    const current = await this.fingerprints.openTaskPort(binding).captureAll({
      filePaths: receipt.files.map((file) => file.filePath),
    })
    assertCurrentBaseline(receipt.files, current)
    return Object.freeze({
      expectedRevision: receipt.expectedRevision,
      expiresAt: receipt.expiresAt,
      files: receipt.files.map((file) => ({ ...file })),
      projectId: receipt.projectId,
      proposalId: receipt.proposalId,
      receiptId: receipt.receiptId,
      runId: receipt.runId,
      sessionId: receipt.sessionId,
      taskId: receipt.taskId,
      verified: true as const,
    })
  }

  openIssuerPort(): AxisReviewedProposalReceiptIssuerPort {
    return Object.freeze({
      capture: (
        input: Parameters<AxisReviewedProposalReceiptIssuerPort['capture']>[0],
      ) => this.capture(input),
      issue: (
        input: Parameters<AxisReviewedProposalReceiptIssuerPort['issue']>[0],
      ) => this.issue(input),
    })
  }

  openVerifierPort(): AxisReviewedProposalReceiptVerifierPort {
    return Object.freeze({
      verify: (
        input: Parameters<AxisReviewedProposalReceiptVerifierPort['verify']>[0],
      ) => this.verify(input),
    })
  }

  private sign(value: object): string {
    return createHmac('sha256', this.secret)
      .update(JSON.stringify(value))
      .digest('hex')
  }
}

function assertBinding(
  baseline: AxisReviewedProposalBaseline,
  proposal: AxisSafeWriteProposal,
): void {
  if (
    baseline.runId !== proposal.runId
    || baseline.sessionId !== proposal.sessionId
    || baseline.taskId !== proposal.taskId
  ) {
    throw new Error('Axis reviewed proposal baseline binding does not match the proposal')
  }
}

function assertProposalOriginalMatchesEvidence(
  file: AxisSafeWriteProposal['files'][number],
  state: AxisReviewedSafeWriteReceiptFile['state'],
): void {
  if (file.originalState === 'missing') {
    if (state.kind !== 'missing') {
      throw new Error(`Axis reviewed proposal baseline changed: ${file.filePath}`)
    }
    return
  }
  if (
    state.kind !== 'exists'
    || state.contentSha256 !== file.originalSha256
    || state.byteLength !== Buffer.byteLength(file.originalContent, 'utf8')
  ) {
    throw new Error(`Axis reviewed proposal baseline changed: ${file.filePath}`)
  }
}

function assertWritesMatchReceipt(
  writes: Array<{ content: string; filePath: string }>,
  files: AxisReviewedSafeWriteReceiptFile[],
): void {
  if (
    writes.length !== files.length
    || new Set(writes.map((write) => write.filePath)).size !== writes.length
  ) {
    throw new Error('Axis reviewed proposal write set does not match the receipt')
  }
  const filesByPath = new Map(files.map((file) => [file.filePath, file]))
  for (const write of writes) {
    const file = filesByPath.get(write.filePath)
    if (!file || file.proposedContentSha256 !== sha256(write.content)) {
      throw new Error(`Axis reviewed proposal content does not match the receipt: ${write.filePath}`)
    }
  }
}

function assertCurrentBaseline(
  files: AxisReviewedSafeWriteReceiptFile[],
  current: Awaited<ReturnType<
    ReturnType<AxisFileFingerprintPortFactory['openTaskPort']>['captureAll']
  >>,
): void {
  if (current.length !== files.length) {
    throw new Error('Axis reviewed proposal baseline changed before submission')
  }
  const currentByKey = new Map(current.map((evidence) => [evidence.fileKey, evidence]))
  for (const file of files) {
    const evidence = currentByKey.get(file.fileKey)
    if (
      !evidence
      || evidence.projectRelativePath !== file.projectRelativePath
      || JSON.stringify(evidence.state) !== JSON.stringify(file.state)
    ) {
      throw new Error(`Axis reviewed proposal baseline changed before submission: ${file.filePath}`)
    }
  }
}

function safeSignatureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex')
  const rightBytes = Buffer.from(right, 'hex')
  return leftBytes.length === rightBytes.length
    && timingSafeEqual(leftBytes, rightBytes)
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
