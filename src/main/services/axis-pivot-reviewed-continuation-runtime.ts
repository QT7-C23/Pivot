import type {
  AxisPivotReviewedContinuationOrchestration,
  AxisPivotReviewedContinuationRequest,
} from '../../shared/axis-pivot-reviewed-continuation-contracts'
import type {
  AxisPivotContinuationAuthorizationPort,
  AxisPivotGuardedContinuationConsumerPort,
} from './axis-pivot-guarded-continuation-ports'
import { AxisPivotReviewedContinuationOrchestrator } from './axis-pivot-reviewed-continuation-orchestrator'
import type { AxisSafeWriteProposalPort } from './axis-pivot-reviewed-continuation-ports'
import { AxisPivotReviewedContinuationRegistry } from './axis-pivot-reviewed-continuation-registry'

export interface AxisPivotReviewedContinuationRuntime {
  close(): void
  deleteForSession(sessionId: string): void
  find(decisionId: string): AxisPivotReviewedContinuationOrchestration | null
  orchestrate(
    request: AxisPivotReviewedContinuationRequest,
  ): Promise<AxisPivotReviewedContinuationOrchestration>
  readonly ready: Promise<void>
}

export function createAxisPivotReviewedContinuationRuntime(options: {
  authorization: AxisPivotContinuationAuthorizationPort | null
  continuations: AxisPivotGuardedContinuationConsumerPort | null
  databasePath?: string
  proposals: AxisSafeWriteProposalPort | null
}): AxisPivotReviewedContinuationRuntime | null {
  if (!options.authorization || !options.continuations || !options.proposals) {
    return null
  }
  const orchestrations = new AxisPivotReviewedContinuationRegistry(
    options.databasePath ?? ':memory:',
  )
  const orchestrator = new AxisPivotReviewedContinuationOrchestrator({
    authorization: options.authorization,
    continuations: options.continuations,
    orchestrations,
    proposals: options.proposals,
  })
  const ready = Promise.resolve().then(() => {
    orchestrations.recoverInterrupted()
  })
  let closed = false
  return Object.freeze({
    close() {
      if (closed) return
      closed = true
      orchestrations.close()
    },
    deleteForSession: (sessionId: string) => orchestrations.deleteForSession(sessionId),
    find: (decisionId: string) => orchestrations.findByDecision(decisionId),
    async orchestrate(request: AxisPivotReviewedContinuationRequest) {
      await ready
      return orchestrator.orchestrate(request)
    },
    ready,
  })
}
