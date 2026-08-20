import { createHash } from 'node:crypto'
import {
  AxisGuardedSafeWriteCompletionEvidenceSchema,
  AxisGuardedSafeWriteResultSchema,
  AxisGateBatchResultSchema,
  AxisSafeWriteIntentSchema,
  AxisTaskSchema,
  type AxisCheckpointReceipt,
  type AxisExecutionAuthorityEnvelope,
  type AxisExecutionTransaction,
  type AxisGateBatchResult,
  type AxisGuardedSafeWriteCompletionEvidence,
  type AxisGuardedSafeWriteResult,
  type AxisSafeWriteIntent,
  type AxisSafeWriteReceipt,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import type { AxisCheckpointReceiptIssuer } from './axis-checkpoint-receipt-issuer'
import type { AxisAuthorityBinding, AxisExecutionAuthorityService } from './axis-execution-authority'
import type { AxisExecutionTransactionPort } from './axis-execution-transaction-journal'
import type {
  AxisFileFingerprintPortFactory,
  AxisTaskFileFingerprintPort,
} from './axis-file-fingerprint-ports'
import type {
  AxisFileLeasePortFactory,
  AxisTaskFileLeasePort,
} from './axis-file-lease-ports'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import type { AxisGuardedSafeWriteExecutionRequest } from './axis-guarded-safe-write-ports'
import { AxisGuardedTransaction } from './axis-guarded-transaction'
import { AxisExecutionBlockedError, type AxisMainPermissionGrantCollector } from './axis-permission-grant-collector'
import type { AxisRollbackPort } from './axis-rollback-port'
import type { AxisSemanticReviewPort } from './axis-semantic-review-coordinator'
import type { AxisSemanticReviewSnapshotPort } from './axis-semantic-review-snapshot'

export interface AxisRealExecutionFeaturePort {
  isRealExecutionEnabled(): boolean
}

export interface AxisGuardedSafeWriteWorker {
  execute(input: {
    binding: AxisAuthorityBinding
    envelope: AxisExecutionAuthorityEnvelope
    intent: AxisSafeWriteIntent
  }): Promise<AxisSafeWriteReceipt>
}

export interface AxisSafeWriteGatePort {
  supports(
    projectRoot: string,
    sessionId: string,
    gates: Array<AxisGateBatchResult['gates'][number]['gate']>,
  ): boolean
  run(input: {
    cycle?: number
    projectRoot: string
    runId: string
    sessionId: string
    taskId: string
    requiredGates: Array<AxisGateBatchResult['gates'][number]['gate']>
  }): Promise<AxisGateBatchResult>
}

export interface AxisGuardedSafeWriteEvidencePort {
  recordPrecommit(input: {
    gateResult: AxisGateBatchResult
    runId: string
    sessionId: string
    taskId: string
    writeReceipts: AxisSafeWriteReceipt[]
  }): Promise<void>
}

export type AxisGuardedSafeWriteRequest = AxisGuardedSafeWriteExecutionRequest

export class AxisGuardedSafeWriteHarness {
  private readonly authority: AxisExecutionAuthorityService
  private readonly blackboardEvidence?: AxisGuardedSafeWriteEvidencePort
  private readonly checkpointIssuer: AxisCheckpointReceiptIssuer
  private readonly feature: AxisRealExecutionFeaturePort
  private readonly fileFingerprints: AxisFileFingerprintPortFactory
  private readonly fileLeases: AxisFileLeasePortFactory
  private readonly gates: AxisSafeWriteGatePort
  private readonly grantCollector: AxisMainPermissionGrantCollector
  private readonly guardedTransaction: AxisGuardedTransaction
  private readonly leaseTtlMs: number
  private readonly projectBindings: AxisProjectBindingReaderPort
  private readonly semanticReview?: AxisSemanticReviewPort
  private readonly semanticReviewSnapshots?: AxisSemanticReviewSnapshotPort
  private readonly worker: AxisGuardedSafeWriteWorker

  constructor(options: {
    authority: AxisExecutionAuthorityService
    blackboardEvidence?: AxisGuardedSafeWriteEvidencePort
    checkpointIssuer: AxisCheckpointReceiptIssuer
    feature: AxisRealExecutionFeaturePort
    fileFingerprints: AxisFileFingerprintPortFactory
    fileLeases: AxisFileLeasePortFactory
    gates: AxisSafeWriteGatePort
    grantCollector: AxisMainPermissionGrantCollector
    leaseTtlMs?: number
    projectBindings: AxisProjectBindingReaderPort
    rollback: AxisRollbackPort
    semanticReview?: AxisSemanticReviewPort
    semanticReviewSnapshots?: AxisSemanticReviewSnapshotPort
    transactions: AxisExecutionTransactionPort
    worker: AxisGuardedSafeWriteWorker
  }) {
    this.authority = options.authority
    this.blackboardEvidence = options.blackboardEvidence
    this.checkpointIssuer = options.checkpointIssuer
    this.feature = options.feature
    this.fileFingerprints = options.fileFingerprints
    this.fileLeases = options.fileLeases
    this.gates = options.gates
    this.grantCollector = options.grantCollector
    this.leaseTtlMs = options.leaseTtlMs ?? 60_000
    if (!Number.isInteger(this.leaseTtlMs) || this.leaseTtlMs < 1_000 || this.leaseTtlMs > 5 * 60_000) {
      throw new Error('Axis safe-write lease TTL must be between 1 second and 5 minutes')
    }
    this.projectBindings = options.projectBindings
    if (Boolean(options.semanticReview) !== Boolean(options.semanticReviewSnapshots)) {
      throw new Error('Axis semantic review coordinator and snapshot Port must be configured together')
    }
    this.semanticReview = options.semanticReview
    this.semanticReviewSnapshots = options.semanticReviewSnapshots
    this.guardedTransaction = new AxisGuardedTransaction({
      rollback: options.rollback,
      transactions: options.transactions,
    })
    this.worker = options.worker
  }

  async execute(input: AxisGuardedSafeWriteRequest): Promise<AxisGuardedSafeWriteResult> {
    const task = AxisTaskSchema.parse(input.task)
    let checkpointReceipts: AxisCheckpointReceipt[] = []
    if (!this.feature.isRealExecutionEnabled()) {
      return blockedResult(input, task, checkpointReceipts, 'feature-disabled', 'Axis real file execution is disabled')
    }

    try {
      assertReviewedProposalRequest(input, task)
      if (!this.gates.supports(input.projectRoot, input.sessionId, task.requiredGates)) {
        const unavailable = task.requiredGates.find((gate) => (
          !this.gates.supports(input.projectRoot, input.sessionId, [gate])
        ))
        throw new AxisExecutionBlockedError(
          'authority-failed',
          `Axis required ${unavailable ?? 'classification'} Gate is unavailable`,
        )
      }
      const grant = await this.grantCollector.collect({
        projectRoot: input.projectRoot,
        runId: input.runId,
        sessionId: input.sessionId,
        signal: input.signal,
        task,
      })
      if (grant.grantedTools.length !== 1 || grant.grantedTools[0] !== 'fs.safeWrite') {
        throw new AxisExecutionBlockedError('authority-failed', 'Axis safe-write execution requires exactly the fs.safeWrite tool')
      }
      const intents = await this.createIntents(grant.projectRoot, grant.grantedFiles, grant.grantedTools[0], input.writes)
      const projectBinding = this.projectBindings.findBySession(grant.sessionId)
      if (!projectBinding) {
        throw new AxisSafeWriteCoordinationError(
          'lease-failed',
          `No authoritative Axis project binding exists for session ${grant.sessionId}`,
        )
      }
      const projectId = projectBinding.projectId
      const coordinationBinding = {
        projectId,
        runId: grant.runId,
        sessionId: grant.sessionId,
        taskId: grant.taskId,
      }
      const leasePort = this.fileLeases.openTaskPort(coordinationBinding)
      const fingerprintPort = this.fileFingerprints.openTaskPort(coordinationBinding)
      let acquiredLeaseIds: string[] = []
      try {
        const leases = await this.acquireLeases(leasePort, grant.grantedFiles)
        acquiredLeaseIds = leases.map((lease) => lease.leaseId)
        const fingerprints = await fingerprintPort.captureAll({ filePaths: grant.grantedFiles })
        assertReviewedProposalFingerprintBaseline(
          input.reviewedProposal,
          projectId,
          fingerprints,
        )
        const checkpointBatch = await this.checkpointIssuer.issue({ grant, signal: input.signal, task })
        checkpointReceipts = checkpointBatch.receipts
        if (input.signal?.aborted) throw new AxisExecutionBlockedError('aborted', 'Axis safe-write execution was aborted before authority issuance')
        const envelope = await this.authority.issue({
          checkpointReceipts,
          fileFingerprintEvidence: fingerprints,
          fileLeaseEvidence: leases,
          grantedFilePaths: grant.grantedFiles,
          grantedTools: grant.grantedTools,
          mode: 'safe-write',
          projectId,
          projectRoot: grant.projectRoot,
          runId: grant.runId,
          sessionId: grant.sessionId,
          task,
        })
        await this.verifyCoordinationEvidence(leasePort, fingerprintPort, envelope)
        const binding = {
          projectRoot: grant.projectRoot,
          runId: grant.runId,
          sessionId: grant.sessionId,
          taskId: grant.taskId,
        }
        const transaction = this.guardedTransaction.start({
          projectRoot: grant.projectRoot,
          receipts: checkpointReceipts,
          runId: grant.runId,
          sessionId: grant.sessionId,
          taskId: grant.taskId,
        })
        const writeReceipts: AxisSafeWriteReceipt[] = []
        let gateResult: AxisGateBatchResult | null = null
        let completedTransaction: AxisExecutionTransaction | null = null
        try {
          for (const intent of intents) {
            if (input.signal?.aborted) throw new Error('Axis safe-write execution was aborted during worker execution')
            writeReceipts.push(await this.worker.execute({ binding, envelope, intent }))
          }
          gateResult = AxisGateBatchResultSchema.parse(await this.gates.run({
            cycle: 1,
            projectRoot: grant.projectRoot,
            runId: grant.runId,
            sessionId: grant.sessionId,
            taskId: grant.taskId,
            requiredGates: task.requiredGates,
          }))
          if (gateResult.runId !== grant.runId || gateResult.sessionId !== grant.sessionId || gateResult.taskId !== grant.taskId) {
            throw new Error('Axis Gate 1 result ownership does not match the safe-write transaction')
          }
          if (!sameValues(
            gateResult.gates.map((gate) => gate.gate),
            task.requiredGates,
          )) {
            throw new Error('Axis Gate 1 result is missing required Gate evidence')
          }
          if (gateResult.status !== 'passed') throw new Error('Axis Gate 1 rejected the safe-write transaction')
          if (this.semanticReview && this.semanticReviewSnapshots) {
            const snapshot = await this.semanticReviewSnapshots.create({
              checkpointReceipts,
              projectRoot: grant.projectRoot,
              task,
              writeReceipts,
            })
            const semanticResult = await this.semanticReview.review({
              ...snapshot,
              runId: grant.runId,
              sessionId: grant.sessionId,
              signal: input.signal,
              taskId: grant.taskId,
            })
            if (semanticResult.status !== 'passed') {
              throw new Error(`Axis semantic review rejected the safe-write transaction: ${semanticResult.requiredAction}`)
            }
          }
          await this.blackboardEvidence?.recordPrecommit({
            gateResult,
            runId: grant.runId,
            sessionId: grant.sessionId,
            taskId: grant.taskId,
            writeReceipts,
          })
          completedTransaction = this.guardedTransaction.complete(transaction)
        } catch (error) {
          const rollbackOutcomes = await this.guardedTransaction.rollback(transaction, {
            projectRoot: grant.projectRoot,
            receipts: checkpointReceipts,
            runId: grant.runId,
            sessionId: grant.sessionId,
            taskId: grant.taskId,
          })
          const rollbackIncomplete = rollbackOutcomes.some((outcome) => outcome.status === 'failed')
          return AxisGuardedSafeWriteResultSchema.parse({
            blockReason: null,
            checkpointReceipts,
            completionEvidence: null,
            detail: error instanceof Error ? error.message : 'Axis safe-write worker execution failed',
            gateResult,
            mode: 'safe-write',
            rollbackOutcomes,
            runId: grant.runId,
            sessionId: grant.sessionId,
            status: rollbackIncomplete ? 'failed-rollback-incomplete' : 'failed-rolled-back',
            taskId: grant.taskId,
            writeReceipts,
          })
        }
        if (!completedTransaction || !gateResult) {
          throw new Error('Axis safe-write durable completion evidence was not produced')
        }
        return AxisGuardedSafeWriteResultSchema.parse({
          blockReason: null,
          checkpointReceipts,
          completionEvidence: completionEvidence(
            completedTransaction,
            gateResult,
            writeReceipts,
          ),
          detail: `Wrote ${writeReceipts.length} authorized file(s) with durable completion and rollback evidence`,
          gateResult,
          mode: 'safe-write',
          rollbackOutcomes: [],
          runId: grant.runId,
          sessionId: grant.sessionId,
          status: 'completed',
          taskId: grant.taskId,
          writeReceipts,
        })
      } finally {
        await this.releaseAcquiredLeases(leasePort, acquiredLeaseIds)
      }
    } catch (error) {
      const reason = error instanceof AxisSafeWriteCoordinationError
        ? error.reason
        : error instanceof AxisExecutionBlockedError
          ? error.reason
          : 'authority-failed'
      return blockedResult(
        input,
        task,
        checkpointReceipts,
        reason,
        error instanceof Error ? error.message : 'Axis safe-write execution was blocked',
      )
    }
  }

  private async acquireLeases(
    leasePort: AxisTaskFileLeasePort,
    filePaths: string[],
  ) {
    try {
      return await leasePort.acquireAll({ filePaths, ttlMs: this.leaseTtlMs })
    } catch (error) {
      throw new AxisSafeWriteCoordinationError(
        'lease-failed',
        error instanceof Error ? error.message : 'Axis file lease acquisition failed',
      )
    }
  }

  private async verifyCoordinationEvidence(
    leasePort: AxisTaskFileLeasePort,
    fingerprintPort: AxisTaskFileFingerprintPort,
    envelope: AxisExecutionAuthorityEnvelope,
  ): Promise<void> {
    try {
      await leasePort.verifyAll({
        leases: envelope.fileLeaseEvidence.map(({ leaseId, version }) => ({
          expectedVersion: version,
          leaseId,
        })),
      })
    } catch (error) {
      throw new AxisSafeWriteCoordinationError(
        'lease-failed',
        error instanceof Error ? error.message : 'Axis file lease verification failed',
      )
    }
    const verification = await fingerprintPort.verifyAll({
      evidence: envelope.fileFingerprintEvidence,
    })
    if (verification.status === 'rejected') {
      const changes = verification.results
        .filter((result) => result.status === 'rejected')
        .map((result) => `${result.projectRelativePath}:${result.reason}`)
      throw new AxisSafeWriteCoordinationError(
        'external-change',
        `External file change detected after checkpoint: ${changes.join(', ')}`,
      )
    }
  }

  private async releaseAcquiredLeases(
    leasePort: AxisTaskFileLeasePort,
    acquiredLeaseIds: string[],
  ): Promise<void> {
    if (acquiredLeaseIds.length === 0) return
    const acquiredSet = new Set(acquiredLeaseIds)
    const activeLeases = (await leasePort.listOwn())
      .filter((lease) => lease.status === 'active' && acquiredSet.has(lease.leaseId))
    if (activeLeases.length === 0) return
    await leasePort.releaseAll({
      leases: activeLeases.map(({ leaseId, version }) => ({
        expectedVersion: version,
        leaseId,
      })),
    })
  }

  private async createIntents(
    projectRoot: string,
    grantedFiles: string[],
    toolName: string,
    writes: Array<{ content: string; filePath: string }>,
  ): Promise<AxisSafeWriteIntent[]> {
    const intents = await Promise.all(writes.map(async ({ content, filePath }) => AxisSafeWriteIntentSchema.parse({
      content,
      contentSha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      filePath: await this.authority.canonicalizeFile(projectRoot, filePath),
      operation: 'write',
      toolName,
    })))
    if (!sameValues(intents.map((intent) => intent.filePath), grantedFiles)) {
      throw new AxisExecutionBlockedError('authority-failed', 'Safe-write inputs must exactly match the granted task files')
    }
    return intents
  }
}

function assertReviewedProposalRequest(
  input: AxisGuardedSafeWriteRequest,
  task: AxisTask,
): void {
  const reviewed = input.reviewedProposal
  if (
    !reviewed
    || reviewed.verified !== true
    || reviewed.runId !== input.runId
    || reviewed.sessionId !== input.sessionId
    || reviewed.taskId !== task.id
  ) {
    throw new AxisExecutionBlockedError(
      'authority-failed',
      'Axis safe-write requires an exact verified reviewed proposal binding',
    )
  }
  if (!sameValues(
    reviewed.files.map((file) => file.filePath),
    input.writes.map((write) => write.filePath),
  )) {
    throw new AxisExecutionBlockedError(
      'authority-failed',
      'Axis safe-write writes must exactly match the reviewed proposal files',
    )
  }
  const reviewedByPath = new Map(
    reviewed.files.map((file) => [file.filePath, file]),
  )
  for (const write of input.writes) {
    const reviewedFile = reviewedByPath.get(write.filePath)
    if (
      !reviewedFile
      || reviewedFile.proposedContentSha256
        !== createHash('sha256').update(write.content, 'utf8').digest('hex')
    ) {
      throw new AxisExecutionBlockedError(
        'authority-failed',
        `Axis safe-write content does not match the reviewed proposal: ${write.filePath}`,
      )
    }
  }
}

function assertReviewedProposalFingerprintBaseline(
  reviewed: AxisGuardedSafeWriteRequest['reviewedProposal'],
  projectId: string,
  fingerprints: AxisExecutionAuthorityEnvelope['fileFingerprintEvidence'],
): void {
  if (reviewed.projectId !== projectId || fingerprints.length !== reviewed.files.length) {
    throw new AxisSafeWriteCoordinationError(
      'external-change',
      'Axis reviewed proposal baseline does not match the authoritative project',
    )
  }
  const fingerprintsByKey = new Map(
    fingerprints.map((evidence) => [evidence.fileKey, evidence]),
  )
  for (const file of reviewed.files) {
    const evidence = fingerprintsByKey.get(file.fileKey)
    if (
      !evidence
      || evidence.projectRelativePath !== file.projectRelativePath
      || JSON.stringify(evidence.state) !== JSON.stringify(file.state)
    ) {
      throw new AxisSafeWriteCoordinationError(
        'external-change',
        `Axis reviewed proposal baseline changed before execution: ${file.filePath}`,
      )
    }
  }
}

class AxisSafeWriteCoordinationError extends Error {
  readonly reason: 'external-change' | 'lease-failed'

  constructor(reason: 'external-change' | 'lease-failed', message: string) {
    super(message)
    this.name = 'AxisSafeWriteCoordinationError'
    this.reason = reason
  }
}

function blockedResult(
  input: Pick<AxisGuardedSafeWriteRequest, 'runId' | 'sessionId'>,
  task: AxisTask,
  checkpointReceipts: AxisCheckpointReceipt[],
  blockReason: NonNullable<AxisGuardedSafeWriteResult['blockReason']>,
  detail: string,
): AxisGuardedSafeWriteResult {
  return AxisGuardedSafeWriteResultSchema.parse({
    blockReason,
    checkpointReceipts,
    completionEvidence: null,
    detail,
    gateResult: null,
    mode: 'safe-write',
    rollbackOutcomes: [],
    runId: input.runId,
    sessionId: input.sessionId,
    status: 'blocked',
    taskId: task.id,
    writeReceipts: [],
  })
}

function completionEvidence(
  transaction: AxisExecutionTransaction,
  gateResult: AxisGateBatchResult,
  writeReceipts: AxisSafeWriteReceipt[],
): AxisGuardedSafeWriteCompletionEvidence {
  return AxisGuardedSafeWriteCompletionEvidenceSchema.parse({
    authority: 'pivot-main',
    checkpointReceipts: transaction.checkpointReceipts,
    completedAt: transaction.updatedAt,
    gateEvidenceIds: gateResult.evidenceIds,
    runId: transaction.runId,
    schemaVersion: 1,
    sessionId: transaction.sessionId,
    status: transaction.status,
    taskId: transaction.taskId,
    transactionId: transaction.transactionId,
    transactionRevision: transaction.revision,
    writes: writeReceipts.map(({ contentSha256, envelopeId, filePath }) => ({
      contentSha256,
      envelopeId,
      filePath,
    })),
  })
}

function sameValues(left: string[], right: string[]): boolean {
  return new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}
