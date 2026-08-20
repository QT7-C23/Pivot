import type { AxisSemanticReviewRequest } from '../../shared/axis-semantic-review-contracts'
import type { AxisSemanticReviewerPort } from './axis-semantic-review-port'

export class AxisFallbackSemanticReviewerAdapter implements AxisSemanticReviewerPort {
  readonly identity
  readonly route

  constructor(
    private readonly primary: AxisSemanticReviewerPort,
    private readonly fallback: AxisSemanticReviewerPort,
  ) {
    if (identityKey(primary) === identityKey(fallback)) {
      throw new Error('Primary and fallback semantic Reviewers must have distinct identities')
    }
    this.identity = primary.identity
    this.route = primary.route
  }

  async review(request: AxisSemanticReviewRequest, signal?: AbortSignal): Promise<unknown> {
    try {
      return withIdentity(await this.primary.review(request, signal), this.primary)
    } catch (primaryError) {
      if (signal?.aborted) throw primaryError
      try {
        return withIdentity(await this.fallback.review(request, signal), this.fallback)
      } catch (fallbackError) {
        throw new AggregateError(
          [primaryError, fallbackError],
          'Both primary and fallback semantic Reviewers failed',
        )
      }
    }
  }
}

function withIdentity(response: unknown, reviewer: AxisSemanticReviewerPort): unknown {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response
  return { ...response, reviewer: reviewer.identity }
}

function identityKey(reviewer: AxisSemanticReviewerPort): string {
  return `${reviewer.identity.providerId}\u0000${reviewer.identity.modelId}`
}
