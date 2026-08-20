import {
  AxisFakeMutationReceiptSchema,
  AxisMutationIntentSchema,
  type AxisExecutionAuthorityEnvelope,
  type AxisFakeMutationReceipt,
  type AxisMutationIntent,
} from '../../shared/axis-engine-contracts'
import type { AxisAuthorityAuditPort } from './axis-authority-audit-registry'
import type { AxisAuthorityBinding, AxisAuthorityVerifier } from './axis-execution-authority'

export class AxisFakeMutatingExecutor {
  private readonly audit?: AxisAuthorityAuditPort
  private readonly authority: AxisAuthorityVerifier
  private readonly clock: () => Date

  constructor(options: { audit?: AxisAuthorityAuditPort; authority: AxisAuthorityVerifier; clock?: () => Date }) {
    this.audit = options.audit
    this.authority = options.authority
    this.clock = options.clock ?? (() => new Date())
  }

  async execute(input: { binding: AxisAuthorityBinding; envelope: AxisExecutionAuthorityEnvelope; intent: AxisMutationIntent }): Promise<AxisFakeMutationReceipt> {
    const intent = AxisMutationIntentSchema.parse(input.intent)
    const envelope = await this.authority.verify(input.envelope, input.binding)
    if (envelope.mode !== 'fake-mutation') throw new Error(`Fake mutation executor rejects authority mode: ${envelope.mode}`)
    if (!envelope.allowedTools.includes(intent.toolName)) throw new Error(`Intent exceeds the signed tool capability: ${intent.toolName}`)
    const filePath = await this.authority.canonicalizeFile(envelope.projectRoot, intent.filePath)
    if (!envelope.allowedFiles.includes(filePath)) throw new Error(`Intent exceeds the signed file capability: ${filePath}`)
    const checkpointReceipt = envelope.checkpointReceipts.find((candidate) => candidate.filePath === filePath)
    if (!checkpointReceipt) throw new Error(`Signed checkpoint receipt not found for: ${filePath}`)
    const receipt = AxisFakeMutationReceiptSchema.parse({
      checkpointReceipt,
      envelopeId: envelope.envelopeId,
      intent: { ...intent, filePath },
      mode: 'fake-mutation',
      rollbackOwner: envelope.rollbackOwner,
      runId: envelope.runId,
      sessionId: envelope.sessionId,
      status: 'simulated',
      taskId: envelope.taskId,
      timestamp: this.clock().toISOString(),
    })
    this.audit?.recordMutation(receipt)
    return receipt
  }
}
