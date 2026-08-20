import { stat, unlink } from 'node:fs/promises'
import {
  AxisCheckpointReceiptSchema,
  AxisRollbackOutcomeSchema,
  type AxisRollbackOutcome,
} from '../../shared/axis-engine-contracts'
import type { FileCheckpointRecord, FileCheckpointRestoreResult } from '../../shared/types/domain'
import type { AxisRollbackPort } from './axis-rollback-port'
import { resolvePathWithinRoot } from './file-system'

export interface AxisCheckpointRollbackStore {
  get(checkpointId: string): FileCheckpointRecord | null
  restore(checkpointId: string, projectRoot: string): Promise<FileCheckpointRestoreResult>
}

export class AxisPhysicalRollbackExecutor implements AxisRollbackPort {
  private readonly checkpoints: AxisCheckpointRollbackStore

  constructor(options: { checkpoints: AxisCheckpointRollbackStore }) {
    this.checkpoints = options.checkpoints
  }

  async rollback(input: Parameters<AxisRollbackPort['rollback']>[0]): Promise<AxisRollbackOutcome[]> {
    const projectRoot = await resolvePathWithinRoot(input.projectRoot, input.projectRoot)
    return Promise.all(input.receipts.map(async (candidate) => {
      const receipt = AxisCheckpointReceiptSchema.parse(candidate)
      try {
        if (receipt.rollbackAction === 'restore-checkpoint') {
          return await this.restoreCheckpoint(projectRoot, input.sessionId, receipt)
        }
        return await this.deleteCreatedFile(projectRoot, receipt.filePath)
      } catch (error) {
        return outcome(receipt.filePath, receipt.rollbackAction, 'failed', error instanceof Error ? error.message : 'Unknown rollback failure')
      }
    }))
  }

  private async restoreCheckpoint(
    projectRoot: string,
    sessionId: string,
    receipt: ReturnType<typeof AxisCheckpointReceiptSchema.parse>,
  ): Promise<AxisRollbackOutcome> {
    if (!receipt.checkpointId) throw new Error('Restore rollback requires a checkpoint identifier')
    const filePath = await resolvePathWithinRoot(projectRoot, receipt.filePath, { allowMissingLeaf: true })
    const checkpoint = this.checkpoints.get(receipt.checkpointId)
    if (!checkpoint) throw new Error(`Rollback checkpoint not found: ${receipt.checkpointId}`)
    if (checkpoint.sessionId !== sessionId) throw new Error('Rollback checkpoint session ownership does not match the transaction')
    const checkpointPath = await resolvePathWithinRoot(projectRoot, checkpoint.filePath, { allowMissingLeaf: true })
    if (checkpointPath !== filePath) throw new Error('Rollback checkpoint file ownership does not match the receipt')
    const restored = await this.checkpoints.restore(receipt.checkpointId, projectRoot)
    const restoredPath = await resolvePathWithinRoot(projectRoot, restored.filePath)
    if (restoredPath !== filePath) throw new Error('Checkpoint restore returned an unexpected file path')
    return outcome(receipt.filePath, receipt.rollbackAction, 'completed', `Restored checkpoint ${receipt.checkpointId}`)
  }

  private async deleteCreatedFile(projectRoot: string, requestedFilePath: string): Promise<AxisRollbackOutcome> {
    let filePath: string
    try {
      filePath = await resolvePathWithinRoot(projectRoot, requestedFilePath, { allowMissingLeaf: true })
    } catch (error) {
      if (isNotFoundError(error)) {
        return outcome(requestedFilePath, 'delete-created-file', 'completed', 'Created file is already absent')
      }
      throw error
    }
    try {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) throw new Error('Rollback can delete only regular files')
      await unlink(filePath)
      return outcome(requestedFilePath, 'delete-created-file', 'completed', 'Deleted file created by the interrupted transaction')
    } catch (error) {
      if (isNotFoundError(error)) return outcome(requestedFilePath, 'delete-created-file', 'completed', 'Created file is already absent')
      throw error
    }
  }
}

function outcome(
  filePath: string,
  action: AxisRollbackOutcome['action'],
  status: AxisRollbackOutcome['status'],
  detail: string,
): AxisRollbackOutcome {
  return AxisRollbackOutcomeSchema.parse({ action, detail, filePath, status })
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
