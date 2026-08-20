import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const TimestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp')
export const AxisSemanticReviewKindSchema = z.enum(['correctness', 'security'])

export const AxisSemanticReviewChangedFileSchema = z.object({
  afterSha256: Sha256Schema,
  beforeSha256: Sha256Schema.nullable(),
  filePath: z.string().trim().min(1).max(1_024),
}).strict()

export const AxisSemanticReviewRequestSchema = z.object({
  changedFiles: z.array(AxisSemanticReviewChangedFileSchema).min(1).max(256),
  diff: z.string().min(1).max(500_000),
  diffSha256: Sha256Schema,
  kind: AxisSemanticReviewKindSchema,
  objective: z.string().trim().min(1).max(8_000),
  requestId: IdentifierSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict().superRefine((request, context) => {
  if (new Set(request.changedFiles.map((file) => file.filePath)).size !== request.changedFiles.length) {
    context.addIssue({ code: 'custom', message: 'Semantic review changed files must be unique', path: ['changedFiles'] })
  }
})

export const AxisSemanticReviewFindingSchema = z.object({
  category: z.enum(['correctness', 'security']),
  cvss: z.number().finite().min(0).max(10).nullable(),
  filePath: z.string().trim().min(1).max(1_024),
  line: z.number().int().positive().max(10_000_000).nullable(),
  message: z.string().trim().min(1).max(4_000),
  recommendation: z.string().trim().min(1).max(4_000),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
}).strict().superRefine((finding, context) => {
  if (finding.category === 'security' && finding.cvss === null) {
    context.addIssue({ code: 'custom', message: 'Security findings require CVSS evidence', path: ['cvss'] })
  }
  if (finding.category === 'correctness' && finding.cvss !== null) {
    context.addIssue({ code: 'custom', message: 'Correctness findings cannot carry CVSS evidence', path: ['cvss'] })
  }
})

export const AxisSemanticReviewProposalSchema = z.object({
  confidence: z.number().finite().min(0).max(1),
  findings: z.array(AxisSemanticReviewFindingSchema).max(64),
  kind: AxisSemanticReviewKindSchema,
  requestId: IdentifierSchema,
  schemaVersion: z.literal(1),
  summary: z.string().trim().min(1).max(8_000),
  verdict: z.enum(['passed', 'failed']),
}).strict().superRefine((proposal, context) => {
  if (proposal.verdict === 'passed' && proposal.findings.length > 0) {
    context.addIssue({ code: 'custom', message: 'Passed proposals cannot contain findings', path: ['findings'] })
  }
  if (proposal.verdict === 'failed' && proposal.findings.length === 0) {
    context.addIssue({ code: 'custom', message: 'Failed proposals require findings', path: ['findings'] })
  }
  proposal.findings.forEach((finding, index) => {
    if (finding.category !== proposal.kind) {
      context.addIssue({ code: 'custom', message: 'Finding category must match review kind', path: ['findings', index, 'category'] })
    }
  })
})

export const AxisSemanticReviewDecisionSchema = z.object({
  decidedAt: TimestampSchema,
  decisionId: IdentifierSchema,
  kind: AxisSemanticReviewKindSchema,
  proposal: AxisSemanticReviewProposalSchema.nullable(),
  requestId: IdentifierSchema,
  requiredAction: z.enum(['none', 'retry', 'dedicated-fixer', 'human-review']),
  schemaVersion: z.literal(1),
  status: z.enum(['passed', 'failed', 'unavailable', 'disputed']),
}).strict().superRefine((decision, context) => {
  if (decision.proposal && (decision.proposal.requestId !== decision.requestId || decision.proposal.kind !== decision.kind)) {
    context.addIssue({ code: 'custom', message: 'Decision proposal must match request identity', path: ['proposal'] })
  }
  if (decision.status === 'passed' && (!decision.proposal || decision.proposal.verdict !== 'passed' || decision.requiredAction !== 'none')) {
    context.addIssue({ code: 'custom', message: 'Passed decisions require a passed proposal and no action' })
  }
  if (decision.status !== 'passed' && decision.requiredAction === 'none') {
    context.addIssue({ code: 'custom', message: 'Non-passed decisions require action', path: ['requiredAction'] })
  }
})

const ReviewerIdentitySchema = z.object({
  independentFromWorker: z.literal(true),
  modelId: IdentifierSchema,
  providerId: IdentifierSchema,
  readOnlyTools: z.literal(true),
}).strict()

export const AxisSemanticReviewEvidenceSchema = z.object({
  changedFiles: z.array(AxisSemanticReviewChangedFileSchema).min(1).max(256),
  decision: AxisSemanticReviewDecisionSchema,
  diffSha256: Sha256Schema,
  durationMs: z.number().int().nonnegative().max(600_000),
  evidenceId: IdentifierSchema,
  kind: AxisSemanticReviewKindSchema,
  objectiveSha256: Sha256Schema,
  recordedAt: TimestampSchema,
  requestId: IdentifierSchema,
  reviewer: ReviewerIdentitySchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict().superRefine((evidence, context) => {
  if (evidence.decision.requestId !== evidence.requestId || evidence.decision.kind !== evidence.kind) {
    context.addIssue({ code: 'custom', message: 'Semantic review evidence decision ownership mismatch', path: ['decision'] })
  }
})

export type AxisSemanticReviewKind = z.infer<typeof AxisSemanticReviewKindSchema>
export type AxisSemanticReviewRequest = z.infer<typeof AxisSemanticReviewRequestSchema>
export type AxisSemanticReviewProposal = z.infer<typeof AxisSemanticReviewProposalSchema>
export type AxisSemanticReviewDecision = z.infer<typeof AxisSemanticReviewDecisionSchema>
export type AxisSemanticReviewEvidence = z.infer<typeof AxisSemanticReviewEvidenceSchema>
