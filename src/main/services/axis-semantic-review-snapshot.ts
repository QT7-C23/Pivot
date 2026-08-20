import { createHash } from 'node:crypto'
import type { AxisCheckpointReceipt, AxisSafeWriteReceipt, AxisTask } from '../../shared/axis-engine-contracts'
import type { FileCheckpointRecord } from '../../shared/types/domain'
import { readTextFile } from './file-system'

export interface AxisSemanticReviewSnapshot {
  afterFileLineCounts: Readonly<Record<string, number>>
  changedFiles: Array<{ afterSha256: string; beforeSha256: string | null; filePath: string }>
  diff: string
  diffSha256: string
  objective: string
  requireSecurity: boolean
}

export interface AxisSemanticReviewSnapshotPort {
  create(input: {
    checkpointReceipts: AxisCheckpointReceipt[]
    projectRoot: string
    task: AxisTask
    writeReceipts: AxisSafeWriteReceipt[]
  }): Promise<AxisSemanticReviewSnapshot>
}

export interface AxisCheckpointContentPort { get(checkpointId: string): FileCheckpointRecord | null }

export class AxisMainSemanticReviewSnapshotAdapter implements AxisSemanticReviewSnapshotPort {
  constructor(private readonly checkpoints: AxisCheckpointContentPort) {}

  async create(input: Parameters<AxisSemanticReviewSnapshotPort['create']>[0]): Promise<AxisSemanticReviewSnapshot> {
    const receipts = new Map(input.checkpointReceipts.map((receipt) => [receipt.filePath, receipt]))
    const changedFiles = []
    const afterFileLineCounts: Record<string, number> = {}
    const sections: string[] = []
    for (const write of input.writeReceipts) {
      const receipt = receipts.get(write.filePath)
      if (!receipt) throw new Error(`Semantic review checkpoint is missing for ${write.filePath}`)
      const before = receipt.checkpointId ? this.checkpoints.get(receipt.checkpointId)?.content : ''
      if (before === undefined) throw new Error(`Semantic review checkpoint content is unavailable: ${receipt.checkpointId}`)
      const after = await readTextFile(input.projectRoot, write.filePath)
      if (sha256(after) !== write.contentSha256) throw new Error(`Semantic review after-write digest mismatch: ${write.filePath}`)
      changedFiles.push({ afterSha256: write.contentSha256, beforeSha256: receipt.checkpointId ? sha256(before) : null, filePath: write.filePath })
      afterFileLineCounts[write.filePath] = lineCount(after)
      sections.push(`--- a/${write.filePath}\n+++ b/${write.filePath}\n@@ before @@\n${before}\n@@ after @@\n${after}`)
    }
    const diff = sections.join('\n')
    return {
      afterFileLineCounts: Object.freeze(afterFileLineCounts), changedFiles, diff, diffSha256: sha256(diff), objective: input.task.objective,
      requireSecurity: input.task.requiredGates.includes('security'),
    }
  }
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }

function lineCount(value: string): number {
  if (!value) return 0
  return value.split(/\r?\n/).length
}
