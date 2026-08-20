import { createHash } from 'node:crypto'
import {
  AxisGateBatchResultSchema,
  AxisSafeWriteReceiptSchema,
} from '../../shared/axis-engine-contracts'
import type { AxisBlackboardPortFactory } from './axis-blackboard-ports'
import type { AxisGuardedSafeWriteEvidencePort } from './axis-guarded-safe-write'

export class AxisBlackboardSafeWriteEvidenceRecorder
implements AxisGuardedSafeWriteEvidencePort {
  private readonly blackboards: AxisBlackboardPortFactory

  constructor(options: { blackboards: AxisBlackboardPortFactory }) {
    this.blackboards = options.blackboards
  }

  async recordPrecommit(
    input: Parameters<AxisGuardedSafeWriteEvidencePort['recordPrecommit']>[0],
  ): Promise<void> {
    const gateResult = AxisGateBatchResultSchema.parse(input.gateResult)
    const writeReceipts = input.writeReceipts.map((receipt) => (
      AxisSafeWriteReceiptSchema.parse(receipt)
    ))
    if (
      gateResult.runId !== input.runId
      || gateResult.sessionId !== input.sessionId
      || gateResult.taskId !== input.taskId
      || writeReceipts.some((receipt) => (
        receipt.runId !== input.runId
        || receipt.sessionId !== input.sessionId
        || receipt.taskId !== input.taskId
      ))
    ) {
      throw new Error('Blackboard safe-write evidence ownership does not match the transaction')
    }

    const payload = JSON.stringify({
      evidenceIds: gateResult.evidenceIds,
      gateStatus: gateResult.status,
      phase: 'precommit',
      runId: input.runId,
      schemaVersion: 1,
      sessionId: input.sessionId,
      taskId: input.taskId,
      writes: writeReceipts.map((receipt) => ({
        contentSha256: receipt.contentSha256,
        envelopeId: receipt.envelopeId,
        filePath: receipt.filePath,
        sizeBytes: receipt.sizeBytes,
      })),
    })
    const digestSha256 = createHash('sha256').update(payload, 'utf8').digest('hex')
    const taskPort = this.blackboards.openTaskPort({
      runId: input.runId,
      sessionId: input.sessionId,
      taskId: input.taskId,
    })
    const current = taskPort.read()
    taskPort.appendEvidence({
      draft: {
        digestSha256,
        evidenceId: `axis-safe-write-${digestSha256.slice(0, 32)}`,
        evidenceType: 'axis.safe-write.precommit',
        locator: `pivot://axis/runs/${encodeURIComponent(input.runId)}/safe-write/${digestSha256}`,
        mediaType: 'application/vnd.pivot.axis-safe-write-precommit+json',
        source: 'runtime',
        summary: `Gate passed for ${writeReceipts.length} safe-write receipt(s); transaction completion pending.`,
        visibility: 'run',
      },
      expectedRevision: current.revision,
    })
  }
}
