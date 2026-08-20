import {
  AxisSemanticReviewProposalSchema,
  type AxisSemanticReviewProposal,
} from '../../shared/axis-semantic-review-contracts'

export class AxisSemanticReviewFindingPolicy {
  validate(proposalInput: unknown, afterFileLineCounts: Readonly<Record<string, number>>): AxisSemanticReviewProposal {
    const proposal = AxisSemanticReviewProposalSchema.parse(proposalInput)
    for (const finding of proposal.findings) {
      if (!Object.prototype.hasOwnProperty.call(afterFileLineCounts, finding.filePath)) {
        throw new Error(`Semantic review finding does not reference a changed file: ${finding.filePath}`)
      }
      const lineCount = afterFileLineCounts[finding.filePath]!
      if (!Number.isInteger(lineCount) || lineCount < 0) {
        throw new Error(`Semantic review after-file line count is invalid: ${finding.filePath}`)
      }
      if (finding.line === null || finding.line > lineCount) {
        throw new Error(`Semantic review finding line is outside the after-file range: ${finding.filePath}`)
      }
    }
    return proposal
  }
}
