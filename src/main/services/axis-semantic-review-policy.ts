import { randomUUID } from 'node:crypto'
import {
  AxisSemanticReviewDecisionSchema,
  AxisSemanticReviewProposalSchema,
  type AxisSemanticReviewDecision,
  type AxisSemanticReviewRequest,
} from '../../shared/axis-semantic-review-contracts'

export class AxisSemanticReviewPolicy {
  decide(request: AxisSemanticReviewRequest, untrustedProposal: unknown, decidedAt = new Date().toISOString()): AxisSemanticReviewDecision {
    const parsed = AxisSemanticReviewProposalSchema.safeParse(untrustedProposal)
    if (!parsed.success) return decision(request, null, 'unavailable', 'human-review', decidedAt)
    const proposal = parsed.data
    if (proposal.requestId !== request.requestId || proposal.kind !== request.kind) {
      return decision(request, null, 'disputed', 'human-review', decidedAt)
    }
    if (proposal.confidence < 0.7) {
      return decision(request, proposal, 'disputed', 'human-review', decidedAt)
    }
    if (proposal.verdict === 'passed') return decision(request, proposal, 'passed', 'none', decidedAt)
    return decision(
      request,
      proposal,
      'failed',
      request.kind === 'security' ? 'dedicated-fixer' : 'retry',
      decidedAt,
    )
  }
}

function decision(
  request: AxisSemanticReviewRequest,
  proposal: ReturnType<typeof AxisSemanticReviewProposalSchema.parse> | null,
  status: AxisSemanticReviewDecision['status'],
  requiredAction: AxisSemanticReviewDecision['requiredAction'],
  decidedAt: string,
): AxisSemanticReviewDecision {
  return AxisSemanticReviewDecisionSchema.parse({
    decidedAt,
    decisionId: `axis-review-decision-${randomUUID()}`,
    kind: request.kind,
    proposal,
    requestId: request.requestId,
    requiredAction,
    schemaVersion: 1,
    status,
  })
}
