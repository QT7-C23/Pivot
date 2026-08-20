import type { AxisSemanticReviewRequest } from '../../shared/axis-semantic-review-contracts'
import type { AxisSemanticReviewerRoute } from '../../shared/axis-semantic-review-routing-contracts'

export interface AxisSemanticReviewerIdentity {
  independentFromWorker: true
  modelId: string
  providerId: string
  readOnlyTools: true
}

export interface AxisSemanticReviewerPort {
  readonly identity: AxisSemanticReviewerIdentity
  readonly route?: Readonly<AxisSemanticReviewerRoute>
  review(request: AxisSemanticReviewRequest, signal?: AbortSignal): Promise<unknown>
}
