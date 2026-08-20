import type { AxisSemanticReviewRequest } from '../../shared/axis-semantic-review-contracts'
import type { AxisSemanticReviewerPort } from './axis-semantic-review-port'

export type AxisSemanticReviewerCircuitState = 'closed' | 'open' | 'half-open'

export interface AxisSemanticReviewerCircuitSnapshot {
  consecutiveFailures: number
  openedAt: number | null
  state: AxisSemanticReviewerCircuitState
}

export class AxisSemanticReviewerCircuitOpenError extends Error {
  constructor() {
    super('Semantic Reviewer circuit is open')
    this.name = 'AxisSemanticReviewerCircuitOpenError'
  }
}

export class AxisSemanticReviewCircuitBreaker implements AxisSemanticReviewerPort {
  readonly identity
  readonly route
  private consecutiveFailures = 0
  private openedAt: number | null = null
  private probeInFlight = false
  private readonly cooldownMs: number
  private readonly failureThreshold: number
  private readonly now: () => number

  constructor(
    private readonly delegate: AxisSemanticReviewerPort,
    options: { cooldownMs?: number; failureThreshold?: number; now?: () => number } = {},
  ) {
    this.identity = delegate.identity
    this.route = delegate.route
    this.cooldownMs = requirePositiveInteger(options.cooldownMs ?? 30_000, 'cooldownMs')
    this.failureThreshold = requirePositiveInteger(options.failureThreshold ?? 3, 'failureThreshold')
    this.now = options.now ?? Date.now
  }

  async review(request: AxisSemanticReviewRequest, signal?: AbortSignal): Promise<unknown> {
    const state = this.currentState()
    if (state === 'open' || (state === 'half-open' && this.probeInFlight)) {
      throw new AxisSemanticReviewerCircuitOpenError()
    }
    if (state === 'half-open') this.probeInFlight = true
    try {
      const response = await this.delegate.review(request, signal)
      this.consecutiveFailures = 0
      this.openedAt = null
      return response
    } catch (error) {
      this.consecutiveFailures += 1
      if (this.consecutiveFailures >= this.failureThreshold) this.openedAt = this.now()
      throw error
    } finally {
      this.probeInFlight = false
    }
  }

  snapshot(): AxisSemanticReviewerCircuitSnapshot {
    return Object.freeze({
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      state: this.currentState(),
    })
  }

  private currentState(): AxisSemanticReviewerCircuitState {
    if (this.openedAt === null) return 'closed'
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open'
  }
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Semantic Reviewer circuit ${name} must be a positive integer`)
  return value
}
