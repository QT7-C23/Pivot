import {
  AxisGuardedExecutionResultSchema,
  AxisMutationIntentSchema,
  AxisTaskSchema,
  type AxisCheckpointReceipt,
  type AxisExecutionAuthorityEnvelope,
  type AxisFakeMutationReceipt,
  type AxisGuardedExecutionResult,
  type AxisMutationIntent,
  type AxisTask,
} from '../../shared/axis-engine-contracts'
import type { AxisCheckpointReceiptIssuer } from './axis-checkpoint-receipt-issuer'
import type { AxisAuthorityBinding, AxisExecutionAuthorityService } from './axis-execution-authority'
import type { AxisExecutionTransactionPort } from './axis-execution-transaction-journal'
import { AxisGuardedTransaction } from './axis-guarded-transaction'
import { AxisExecutionBlockedError, type AxisMainPermissionGrantCollector } from './axis-permission-grant-collector'
import type { AxisRollbackPort } from './axis-rollback-port'

export type { AxisRollbackPort } from './axis-rollback-port'

export interface AxisGuardedFakeWorker {
  execute(input: {
    binding: AxisAuthorityBinding
    envelope: AxisExecutionAuthorityEnvelope
    intent: AxisMutationIntent
  }): Promise<AxisFakeMutationReceipt>
}

export interface AxisGuardedFakeExecutionRequest {
  contentDigests: Array<{ filePath: string; sha256: string }>
  projectRoot: string
  runId: string
  sessionId: string
  signal?: AbortSignal
  task: AxisTask
}

export class AxisGuardedFakeExecutionHarness {
  private readonly authority: AxisExecutionAuthorityService
  private readonly checkpointIssuer: AxisCheckpointReceiptIssuer
  private readonly grantCollector: AxisMainPermissionGrantCollector
  private readonly guardedTransaction: AxisGuardedTransaction
  private readonly worker: AxisGuardedFakeWorker

  constructor(options: {
    authority: AxisExecutionAuthorityService
    checkpointIssuer: AxisCheckpointReceiptIssuer
    grantCollector: AxisMainPermissionGrantCollector
    rollback: AxisRollbackPort
    transactions: AxisExecutionTransactionPort
    worker: AxisGuardedFakeWorker
  }) {
    this.authority = options.authority
    this.checkpointIssuer = options.checkpointIssuer
    this.grantCollector = options.grantCollector
    this.guardedTransaction = new AxisGuardedTransaction({
      rollback: options.rollback,
      transactions: options.transactions,
    })
    this.worker = options.worker
  }

  async execute(input: AxisGuardedFakeExecutionRequest): Promise<AxisGuardedExecutionResult> {
    const task = AxisTaskSchema.parse(input.task)
    let checkpointReceipts: AxisCheckpointReceipt[] = []
    try {
      const grant = await this.grantCollector.collect({
        projectRoot: input.projectRoot,
        runId: input.runId,
        sessionId: input.sessionId,
        signal: input.signal,
        task,
      })
      const intents = await this.createIntents(grant.projectRoot, grant.grantedFiles, grant.grantedTools[0]!, input.contentDigests)
      const checkpointBatch = await this.checkpointIssuer.issue({ grant, signal: input.signal, task })
      checkpointReceipts = checkpointBatch.receipts
      if (input.signal?.aborted) throw new AxisExecutionBlockedError('aborted', 'Axis execution was aborted before authority issuance')
      const envelope = await this.authority.issue({
        checkpointReceipts,
        grantedFilePaths: grant.grantedFiles,
        grantedTools: grant.grantedTools,
        projectRoot: grant.projectRoot,
        runId: grant.runId,
        sessionId: grant.sessionId,
        task,
      })
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
      const mutationReceipts: AxisFakeMutationReceipt[] = []
      try {
        for (const intent of intents) {
          if (input.signal?.aborted) throw new Error('Axis execution was aborted during worker execution')
          mutationReceipts.push(await this.worker.execute({ binding, envelope, intent }))
        }
        this.guardedTransaction.complete(transaction)
      } catch (error) {
        const rollbackOutcomes = await this.guardedTransaction.rollback(transaction, {
          projectRoot: grant.projectRoot,
          receipts: checkpointReceipts,
          runId: grant.runId,
          sessionId: grant.sessionId,
          taskId: grant.taskId,
        })
        const rollbackIncomplete = rollbackOutcomes.some((outcome) => outcome.status === 'failed')
        return AxisGuardedExecutionResultSchema.parse({
          blockReason: null,
          checkpointReceipts,
          detail: error instanceof Error ? error.message : 'Fake worker execution failed',
          mode: 'fake-mutation',
          mutationReceipts,
          rollbackOutcomes,
          runId: grant.runId,
          sessionId: grant.sessionId,
          status: rollbackIncomplete ? 'failed-rollback-incomplete' : 'failed-rolled-back',
          taskId: grant.taskId,
        })
      }
      return AxisGuardedExecutionResultSchema.parse({
        blockReason: null,
        checkpointReceipts,
        detail: `Simulated ${mutationReceipts.length} bounded mutation intent(s) without writing files`,
        mode: 'fake-mutation',
        mutationReceipts,
        rollbackOutcomes: [],
        runId: grant.runId,
        sessionId: grant.sessionId,
        status: 'simulated',
        taskId: grant.taskId,
      })
    } catch (error) {
      const reason = error instanceof AxisExecutionBlockedError ? error.reason : 'authority-failed'
      return AxisGuardedExecutionResultSchema.parse({
        blockReason: reason,
        checkpointReceipts,
        detail: error instanceof Error ? error.message : 'Axis execution was blocked',
        mode: 'fake-mutation',
        mutationReceipts: [],
        rollbackOutcomes: [],
        runId: input.runId,
        sessionId: input.sessionId,
        status: 'blocked',
        taskId: task.id,
      })
    }
  }

  private async createIntents(
    projectRoot: string,
    grantedFiles: string[],
    toolName: string,
    contentDigests: Array<{ filePath: string; sha256: string }>,
  ): Promise<AxisMutationIntent[]> {
    const intents = await Promise.all(contentDigests.map(async (digest) => AxisMutationIntentSchema.parse({
      contentSha256: digest.sha256,
      filePath: await this.authority.canonicalizeFile(projectRoot, digest.filePath),
      operation: 'write',
      toolName,
    })))
    if (!sameValues(intents.map((intent) => intent.filePath), grantedFiles)) {
      throw new AxisExecutionBlockedError('authority-failed', 'Content digests must exactly match the granted task files')
    }
    return intents
  }

}

function sameValues(left: string[], right: string[]): boolean {
  return new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}
