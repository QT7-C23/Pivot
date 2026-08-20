import {
  AxisRollbackOutcomeSchema,
  type AxisExecutionTransaction,
  type AxisRollbackOutcome,
} from '../../shared/axis-engine-contracts'
import type {
  AxisExecutionTransactionCreateInput,
  AxisExecutionTransactionPort,
} from './axis-execution-transaction-journal'
import type { AxisRollbackPort, AxisRollbackRequest } from './axis-rollback-port'

export class AxisGuardedTransaction {
  private readonly rollbackPort: AxisRollbackPort
  private readonly transactions: AxisExecutionTransactionPort

  constructor(options: {
    rollback: AxisRollbackPort
    transactions: AxisExecutionTransactionPort
  }) {
    this.rollbackPort = options.rollback
    this.transactions = options.transactions
  }

  start(input: AxisExecutionTransactionCreateInput): AxisExecutionTransaction {
    const prepared = this.transactions.create(input)
    return this.transactions.markWorkerStarted(revisionRequest(prepared))
  }

  complete(transaction: AxisExecutionTransaction): AxisExecutionTransaction {
    return this.transactions.markCompleted(revisionRequest(transaction))
  }

  async rollback(transaction: AxisExecutionTransaction, request: AxisRollbackRequest): Promise<AxisRollbackOutcome[]> {
    const rolling = this.prepareJournalForRollback(transaction)
    const outcomes = await this.executePhysicalRollback(request)
    if (rolling.status === 'rolling-back') {
      try {
        this.transactions.finishRollback({ ...revisionRequest(rolling), outcomes })
      } catch {
        // The rolling-back state remains recoverable and physical rollback is idempotent.
      }
    }
    return outcomes
  }

  private prepareJournalForRollback(transaction: AxisExecutionTransaction): AxisExecutionTransaction {
    try {
      const pending = this.transactions.markRollbackPending(revisionRequest(transaction))
      return this.transactions.startRollback(revisionRequest(pending))
    } catch {
      // A worker-started entry remains recoverable when journal transitions fail.
      return transaction
    }
  }

  private async executePhysicalRollback(request: AxisRollbackRequest): Promise<AxisRollbackOutcome[]> {
    try {
      const outcomes = (await this.rollbackPort.rollback(request)).map((outcome) => AxisRollbackOutcomeSchema.parse(outcome))
      const expected = request.receipts.map((receipt) => `${receipt.filePath}\u0000${receipt.rollbackAction}`).sort()
      const actual = outcomes.map((outcome) => `${outcome.filePath}\u0000${outcome.action}`).sort()
      if (outcomes.length !== request.receipts.length || JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error('Rollback outcomes do not cover every checkpoint receipt')
      }
      return outcomes
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Rollback port failed'
      return request.receipts.map((receipt) => AxisRollbackOutcomeSchema.parse({
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
