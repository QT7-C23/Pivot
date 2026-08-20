import {
  AxisRollbackOutcomeSchema,
  type AxisExecutionTransaction,
  type AxisRollbackOutcome,
} from '../../shared/axis-engine-contracts'
import type { AxisRollbackPort } from './axis-rollback-port'
import type { AxisExecutionTransactionPort } from './axis-execution-transaction-journal'

export interface AxisExecutionRecoveryJournalPort extends AxisExecutionTransactionPort {
  listRecoverable(limit?: number): AxisExecutionTransaction[]
}

export class AxisExecutionRecoveryCoordinator {
  private readonly journal: AxisExecutionRecoveryJournalPort
  private readonly rollback: AxisRollbackPort

  constructor(options: { journal: AxisExecutionRecoveryJournalPort; rollback: AxisRollbackPort }) {
    this.journal = options.journal
    this.rollback = options.rollback
  }

  async recoverPending(limit = 100): Promise<AxisExecutionTransaction[]> {
    const recovered: AxisExecutionTransaction[] = []
    for (const transaction of this.journal.listRecoverable(limit)) {
      recovered.push(await this.recover(transaction))
    }
    return recovered
  }

  private async recover(input: AxisExecutionTransaction): Promise<AxisExecutionTransaction> {
    let transaction = input
    if (transaction.status === 'worker-started') {
      transaction = this.journal.markRollbackPending(revisionRequest(transaction))
    }
    if (transaction.status === 'rollback-pending' || transaction.status === 'rollback-incomplete') {
      transaction = this.journal.startRollback(revisionRequest(transaction))
    }
    if (transaction.status !== 'rolling-back') {
      throw new Error(`Axis recovery cannot process terminal transaction state: ${transaction.status}`)
    }
    const outcomes = await this.rollbackWithEvidence(transaction)
    return this.journal.finishRollback({ ...revisionRequest(transaction), outcomes })
  }

  private async rollbackWithEvidence(transaction: AxisExecutionTransaction): Promise<AxisRollbackOutcome[]> {
    try {
      return await this.rollback.rollback({
        projectRoot: transaction.projectRoot,
        receipts: transaction.checkpointReceipts,
        runId: transaction.runId,
        sessionId: transaction.sessionId,
        taskId: transaction.taskId,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Rollback executor failed during recovery'
      return transaction.checkpointReceipts.map((receipt) => AxisRollbackOutcomeSchema.parse({
        action: receipt.rollbackAction,
        detail,
        filePath: receipt.filePath,
        status: 'failed',
      }))
    }
  }
}

function revisionRequest(transaction: AxisExecutionTransaction): { expectedRevision: number; transactionId: string } {
  return { expectedRevision: transaction.revision, transactionId: transaction.transactionId }
}
