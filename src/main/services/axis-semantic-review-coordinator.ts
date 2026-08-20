import { createHash, randomUUID } from 'node:crypto'
import {
  AxisSemanticReviewRequestSchema,
  type AxisSemanticReviewDecision,
  type AxisSemanticReviewEvidence,
  type AxisSemanticReviewKind,
  type AxisSemanticReviewRequest,
} from '../../shared/axis-semantic-review-contracts'
import { AxisSemanticReviewerMeasurementSchema } from '../../shared/axis-semantic-review-usage-contracts'
import type { AxisSemanticReviewEvidencePort } from './axis-semantic-review-evidence-registry'
import type { AxisSemanticReviewerPort } from './axis-semantic-review-port'
import type { AxisSemanticReviewUsagePort } from './axis-semantic-review-usage-registry'
import { AxisSemanticReviewPolicy } from './axis-semantic-review-policy'
import { AxisSemanticReviewFindingPolicy } from './axis-semantic-review-finding-policy'

type ChangedFile = AxisSemanticReviewRequest['changedFiles'][number]

export interface AxisSemanticReviewCoordinatorRequest {
  afterFileLineCounts?: Readonly<Record<string, number>>
  changedFiles: ChangedFile[]
  diff: string
  diffSha256: string
  objective: string
  requireSecurity: boolean
  runId: string
  sessionId: string
  signal?: AbortSignal
  taskId: string
}

export interface AxisSemanticReviewCoordinatorResult {
  decisions: AxisSemanticReviewDecision[]
  evidence: AxisSemanticReviewEvidence[]
  requiredAction: AxisSemanticReviewDecision['requiredAction']
  status: AxisSemanticReviewDecision['status']
}

export interface AxisSemanticReviewPort {
  review(input: AxisSemanticReviewCoordinatorRequest): Promise<AxisSemanticReviewCoordinatorResult>
}

export class AxisSemanticReviewCoordinator implements AxisSemanticReviewPort {
  private readonly correctness: AxisSemanticReviewerPort
  private readonly evidencePort: AxisSemanticReviewEvidencePort
  private readonly findingPolicy: AxisSemanticReviewFindingPolicy
  private readonly policy: AxisSemanticReviewPolicy
  private readonly security?: AxisSemanticReviewerPort
  private readonly timeoutMs: number
  private readonly usage?: AxisSemanticReviewUsagePort

  constructor(options: {
    correctness: AxisSemanticReviewerPort
    evidence: AxisSemanticReviewEvidencePort
    policy?: AxisSemanticReviewPolicy
    security?: AxisSemanticReviewerPort
    timeoutMs?: number
    usage?: AxisSemanticReviewUsagePort
  }) {
    this.correctness = options.correctness
    this.evidencePort = options.evidence
    this.findingPolicy = new AxisSemanticReviewFindingPolicy()
    this.policy = options.policy ?? new AxisSemanticReviewPolicy()
    this.security = options.security
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.usage = options.usage
  }

  async review(input: AxisSemanticReviewCoordinatorRequest): Promise<AxisSemanticReviewCoordinatorResult> {
    const evidence: AxisSemanticReviewEvidence[] = []
    const decisions: AxisSemanticReviewDecision[] = []
    const correctness = await this.runOne('correctness', this.correctness, input)
    decisions.push(correctness.decision)
    evidence.push(correctness.evidence)
    if (correctness.decision.status !== 'passed') return result(decisions, evidence, correctness.decision)
    if (!input.requireSecurity) return result(decisions, evidence, correctness.decision)
    if (!this.security) {
      const unavailable = await this.runOne('security', null, input)
      decisions.push(unavailable.decision)
      evidence.push(unavailable.evidence)
      return result(decisions, evidence, unavailable.decision)
    }
    const security = await this.runOne('security', this.security, input)
    decisions.push(security.decision)
    evidence.push(security.evidence)
    return result(decisions, evidence, security.decision)
  }

  private async runOne(kind: AxisSemanticReviewKind, reviewer: AxisSemanticReviewerPort | null, input: AxisSemanticReviewCoordinatorRequest) {
    const request = AxisSemanticReviewRequestSchema.parse({
      changedFiles: input.changedFiles, diff: input.diff, diffSha256: input.diffSha256, kind,
      objective: input.objective, requestId: `axis-review-request-${randomUUID()}`, runId: input.runId,
      schemaVersion: 1, sessionId: input.sessionId, taskId: input.taskId,
    })
    const started = Date.now()
    let proposal: unknown = null
    let selectedIdentity = reviewer?.identity
    if (reviewer && !input.signal?.aborted) {
      try {
        const response = await withTimeout(reviewer.review(request, input.signal), this.timeoutMs)
        const measured = AxisSemanticReviewerMeasurementSchema.safeParse(response)
        if (measured.success && reviewer.route) {
          selectedIdentity = measured.data.reviewer ?? reviewer.identity
          const budget = {
            maxCostUsd: reviewer.route.maxCostUsd,
            maxInputTokens: reviewer.route.maxInputTokens,
            maxOutputTokens: reviewer.route.maxOutputTokens,
          }
          const exceeded = measured.data.usage.costUsd > budget.maxCostUsd
            || measured.data.usage.inputTokens > budget.maxInputTokens
            || measured.data.usage.outputTokens > budget.maxOutputTokens
          this.usage?.record({
            budget,
            ...measured.data.usage,
            kind,
            modelId: selectedIdentity.modelId,
            providerId: selectedIdentity.providerId,
            requestId: request.requestId,
            runId: request.runId,
            schemaVersion: 1,
            sessionId: request.sessionId,
            status: exceeded ? 'exceeded' : 'within-budget',
            taskId: request.taskId,
          })
          proposal = exceeded ? null : measured.data.proposal
        } else {
          proposal = response
        }
      } catch { proposal = null }
    }
    if (input.afterFileLineCounts && proposal) {
      try { proposal = this.findingPolicy.validate(proposal, input.afterFileLineCounts) } catch { proposal = null }
    }
    const decision = this.policy.decide(request, proposal)
    const identity = selectedIdentity ?? {
      independentFromWorker: true as const, modelId: 'unavailable-reviewer', providerId: 'unavailable-provider', readOnlyTools: true as const,
    }
    const persisted = this.evidencePort.record({
      changedFiles: request.changedFiles, decision, diffSha256: request.diffSha256,
      durationMs: Math.min(600_000, Math.max(0, Date.now() - started)), kind,
      objectiveSha256: sha256(request.objective), requestId: request.requestId, reviewer: identity,
      runId: request.runId, schemaVersion: 1, sessionId: request.sessionId, taskId: request.taskId,
    })
    return { decision, evidence: persisted }
  }
}

function result(decisions: AxisSemanticReviewDecision[], evidence: AxisSemanticReviewEvidence[], final: AxisSemanticReviewDecision): AxisSemanticReviewCoordinatorResult {
  return { decisions, evidence, requiredAction: final.requiredAction, status: final.status }
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Semantic Reviewer timed out')), timeoutMs) })])
  } finally { if (timer) clearTimeout(timer) }
}
