import {
  AxisSemanticReviewTelemetryPageSchema,
  AxisSemanticReviewTelemetryQuerySchema,
  type AxisSemanticReviewTelemetryPage,
  type AxisSemanticReviewTelemetryQuery,
} from '../../shared/axis-semantic-review-telemetry-contracts'
import type { AxisSemanticReviewEvidenceReaderPort } from './axis-semantic-review-evidence-registry'
import type { AxisSemanticReviewUsageReaderPort } from './axis-semantic-review-usage-registry'

export interface AxisSemanticReviewTelemetryReaderPort {
  list(query: AxisSemanticReviewTelemetryQuery): AxisSemanticReviewTelemetryPage
}

export class AxisSemanticReviewTelemetryService implements AxisSemanticReviewTelemetryReaderPort {
  constructor(private readonly ports: {
    decisions: AxisSemanticReviewEvidenceReaderPort
    usage: AxisSemanticReviewUsageReaderPort
  }) {}

  list(queryInput: AxisSemanticReviewTelemetryQuery): AxisSemanticReviewTelemetryPage {
    const query = AxisSemanticReviewTelemetryQuerySchema.parse(queryInput)
    const decisions = this.ports.decisions.listForSession(query.sessionId, query.limit)
    const usagePage = this.ports.usage.listForSession(query.sessionId, query.limit)
    const usageByRequest = new Map(usagePage.items.map((entry) => [entry.requestId, entry]))
    const items = decisions.items.map((evidence) => {
      if (evidence.sessionId !== query.sessionId) throw new Error('Semantic review telemetry decision ownership mismatch')
      const usage = usageByRequest.get(evidence.requestId)
      if (usage && (usage.sessionId !== query.sessionId || usage.runId !== evidence.runId || usage.taskId !== evidence.taskId)) {
        throw new Error('Semantic review telemetry usage ownership mismatch')
      }
      return {
        durationMs: evidence.durationMs,
        evidenceId: evidence.evidenceId,
        findingCount: evidence.decision.proposal?.findings.length ?? 0,
        kind: evidence.kind,
        recordedAt: evidence.recordedAt,
        requestId: evidence.requestId,
        requiredAction: evidence.decision.requiredAction,
        reviewer: { modelId: evidence.reviewer.modelId, providerId: evidence.reviewer.providerId },
        runId: evidence.runId,
        status: evidence.decision.status,
        summary: evidence.decision.proposal?.summary ?? 'Semantic Reviewer unavailable',
        taskId: evidence.taskId,
        usage: usage ? {
          costUsd: usage.costUsd,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          status: usage.status,
        } : null,
      }
    })
    return AxisSemanticReviewTelemetryPageSchema.parse({
      available: true, items, schemaVersion: 1,
      truncated: decisions.hasMore || usagePage.hasMore,
      unavailableReason: null,
    })
  }

  static unavailable(reason: 'disabled' | 'not-configured'): AxisSemanticReviewTelemetryPage {
    return AxisSemanticReviewTelemetryPageSchema.parse({
      available: false, items: [], schemaVersion: 1, truncated: false, unavailableReason: reason,
    })
  }
}
