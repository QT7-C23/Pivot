import { describe, expect, it } from 'vitest'
import { AxisSemanticReviewFindingPolicy } from '../../src/main/services/axis-semantic-review-finding-policy'

const proposal = {
  confidence: 0.9,
  findings: [{ category: 'correctness' as const, cvss: null, filePath: 'src/a.ts', line: 2, message: 'defect', recommendation: 'fix', severity: 'high' as const }],
  kind: 'correctness' as const, requestId: 'request-1', schemaVersion: 1 as const, summary: 'failed', verdict: 'failed' as const,
}

describe('AxisSemanticReviewFindingPolicy', () => {
  it('accepts findings bound to changed after-file lines', () => {
    expect(new AxisSemanticReviewFindingPolicy().validate(proposal, { 'src/a.ts': 2 })).toEqual(proposal)
  })

  it('rejects findings outside the changed set, after-file line range, or without a line', () => {
    const policy = new AxisSemanticReviewFindingPolicy()
    expect(() => policy.validate({ ...proposal, findings: [{ ...proposal.findings[0]!, filePath: 'src/other.ts' }] }, { 'src/a.ts': 2 })).toThrow(/changed file/i)
    expect(() => policy.validate({ ...proposal, findings: [{ ...proposal.findings[0]!, line: 3 }] }, { 'src/a.ts': 2 })).toThrow(/line/i)
    expect(() => policy.validate({ ...proposal, findings: [{ ...proposal.findings[0]!, line: null }] }, { 'src/a.ts': 2 })).toThrow(/line/i)
  })
})
