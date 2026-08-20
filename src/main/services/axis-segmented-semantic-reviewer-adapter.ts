import {
  AxisSemanticReviewProposalSchema,
  type AxisSemanticReviewProposal,
  type AxisSemanticReviewRequest,
} from '../../shared/axis-semantic-review-contracts'
import { AxisSemanticReviewerMeasurementSchema } from '../../shared/axis-semantic-review-usage-contracts'
import type { AxisSemanticReviewerPort } from './axis-semantic-review-port'
import type { AxisSemanticReviewerIdentity } from './axis-semantic-review-port'
import { AxisSemanticReviewSegmenter } from './axis-semantic-review-segmenter'

export class AxisSegmentedSemanticReviewerAdapter implements AxisSemanticReviewerPort {
  readonly identity
  readonly route
  private readonly segmenter: AxisSemanticReviewSegmenter

  constructor(
    private readonly delegate: AxisSemanticReviewerPort,
    options: { maxChars?: number } = {},
  ) {
    this.identity = delegate.identity
    this.route = delegate.route
    this.segmenter = new AxisSemanticReviewSegmenter(options)
  }

  async review(request: AxisSemanticReviewRequest, signal?: AbortSignal): Promise<unknown> {
    const batch = this.segmenter.segment(request.diff)
    const proposals: AxisSemanticReviewProposal[] = []
    let costUsd = 0
    let inputTokens = 0
    let outputTokens = 0
    let selectedReviewer: AxisSemanticReviewerIdentity | undefined
    for (const segment of batch.segments) {
      if (signal?.aborted) throw new Error('Semantic review segment processing aborted')
      const response = await this.delegate.review({
        ...request,
        diff: segment.content,
        diffSha256: segment.contentSha256,
        requestId: segmentRequestId(request.requestId, segment.index),
      }, signal)
      const measured = AxisSemanticReviewerMeasurementSchema.safeParse(response)
      if (!measured.success) throw new Error(`Semantic review segment ${segment.index} returned malformed measurement`)
      const proposal = AxisSemanticReviewProposalSchema.safeParse(measured.data.proposal)
      if (!proposal.success
        || proposal.data.requestId !== segmentRequestId(request.requestId, segment.index)
        || proposal.data.kind !== request.kind) {
        throw new Error(`Semantic review segment ${segment.index} returned invalid proposal`)
      }
      proposals.push(proposal.data)
      const segmentReviewer = measured.data.reviewer ?? this.delegate.identity
      if (selectedReviewer && identityKey(selectedReviewer) !== identityKey(segmentReviewer)) {
        throw new Error('Semantic review segments used different Reviewer identities')
      }
      selectedReviewer = segmentReviewer
      costUsd += measured.data.usage.costUsd
      inputTokens += measured.data.usage.inputTokens
      outputTokens += measured.data.usage.outputTokens
    }
    return {
      proposal: aggregateProposal(request, proposals),
      reviewer: selectedReviewer ?? this.identity,
      usage: { costUsd: roundCost(costUsd), inputTokens, outputTokens },
    }
  }
}

function identityKey(identity: AxisSemanticReviewerIdentity): string {
  return `${identity.providerId}\u0000${identity.modelId}`
}

function aggregateProposal(
  request: AxisSemanticReviewRequest,
  proposals: AxisSemanticReviewProposal[],
): AxisSemanticReviewProposal {
  const findings = proposals.flatMap((proposal) => proposal.findings)
  return AxisSemanticReviewProposalSchema.parse({
    confidence: Math.min(...proposals.map((proposal) => proposal.confidence)),
    findings,
    kind: request.kind,
    requestId: request.requestId,
    schemaVersion: 1,
    summary: proposals.map((proposal, index) => `Segment ${index + 1}: ${proposal.summary}`).join('\n').slice(0, 8_000),
    verdict: findings.length > 0 ? 'failed' : 'passed',
  })
}

function segmentRequestId(requestId: string, index: number): string {
  const suffix = `-segment-${index + 1}`
  return `${requestId.slice(0, 160 - suffix.length)}${suffix}`
}

function roundCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000
}
