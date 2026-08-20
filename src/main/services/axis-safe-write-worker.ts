import { createHash } from 'node:crypto'
import {
  AxisSafeWriteIntentSchema,
  AxisSafeWriteReceiptSchema,
  type AxisExecutionAuthorityEnvelope,
  type AxisSafeWriteIntent,
  type AxisSafeWriteReceipt,
} from '../../shared/axis-engine-contracts'
import type { AxisAuthorityAuditPort } from './axis-authority-audit-registry'
import type { AxisAuthorityBinding, AxisAuthorityVerifier } from './axis-execution-authority'
import { writeTextFile } from './file-system'

export interface AxisFileWritePort {
  write(projectRoot: string, filePath: string, content: string): Promise<void>
}

const defaultWriter: AxisFileWritePort = {
  write: writeTextFile,
}

export class AxisSafeWriteWorker {
  private readonly audit?: AxisAuthorityAuditPort
  private readonly authority: AxisAuthorityVerifier
  private readonly clock: () => Date
  private readonly writer: AxisFileWritePort

  constructor(options: {
    audit?: AxisAuthorityAuditPort
    authority: AxisAuthorityVerifier
    clock?: () => Date
    writer?: AxisFileWritePort
  }) {
    this.audit = options.audit
    this.authority = options.authority
    this.clock = options.clock ?? (() => new Date())
    this.writer = options.writer ?? defaultWriter
  }

  async execute(input: {
    binding: AxisAuthorityBinding
    envelope: AxisExecutionAuthorityEnvelope
    intent: AxisSafeWriteIntent
  }): Promise<AxisSafeWriteReceipt> {
    const intent = AxisSafeWriteIntentSchema.parse(input.intent)
    const envelope = await this.authority.verify(input.envelope, input.binding)
    if (envelope.mode !== 'safe-write') throw new Error(`Safe-write worker rejects authority mode: ${envelope.mode}`)
    if (!envelope.allowedTools.includes(intent.toolName)) {
      throw new Error(`Safe-write intent exceeds the signed tool capability: ${intent.toolName}`)
    }
    const filePath = await this.authority.canonicalizeFile(envelope.projectRoot, intent.filePath)
    if (!envelope.allowedFiles.includes(filePath)) {
      throw new Error(`Safe-write intent exceeds the signed file capability: ${filePath}`)
    }
    const checkpointReceipt = envelope.checkpointReceipts.find((candidate) => candidate.filePath === filePath)
    if (!checkpointReceipt) throw new Error(`Signed checkpoint receipt not found for safe-write file: ${filePath}`)

    const contentSha256 = createHash('sha256').update(intent.content, 'utf8').digest('hex')
    if (contentSha256 !== intent.contentSha256.toLowerCase()) {
      throw new Error(`Safe-write content digest does not match the signed intent: ${filePath}`)
    }
    const sizeBytes = Buffer.byteLength(intent.content, 'utf8')
    if (sizeBytes > 16 * 1_024 * 1_024) throw new Error('Safe-write content exceeds the 16 MiB byte limit')

    await this.writer.write(envelope.projectRoot, filePath, intent.content)
    const receipt = AxisSafeWriteReceiptSchema.parse({
      checkpointReceipt,
      contentSha256,
      envelopeId: envelope.envelopeId,
      filePath,
      mode: 'safe-write',
      rollbackOwner: envelope.rollbackOwner,
      runId: envelope.runId,
      sessionId: envelope.sessionId,
      sizeBytes,
      status: 'written',
      taskId: envelope.taskId,
      timestamp: this.clock().toISOString(),
      toolName: intent.toolName,
    })
    this.audit?.recordWrite(receipt)
    return receipt
  }
}
