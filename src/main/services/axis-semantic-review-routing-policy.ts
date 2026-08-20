import {
  AxisSemanticReviewerRoutingSchema,
  AxisSemanticReviewerWorkerIdentitySchema,
  type AxisSemanticReviewerRoute,
  type AxisSemanticReviewerRouting,
  type AxisSemanticReviewerWorkerIdentity,
} from '../../shared/axis-semantic-review-routing-contracts'

function sameModel(left: AxisSemanticReviewerRoute, right: AxisSemanticReviewerWorkerIdentity): boolean {
  return left.providerId === right.providerId && left.modelId === right.modelId
}

function freezeRoute(route: AxisSemanticReviewerRoute): Readonly<AxisSemanticReviewerRoute> {
  return Object.freeze({ ...route })
}

export class AxisSemanticReviewRoutingPolicy {
  resolve(routingInput: unknown, workerInput: unknown): Readonly<AxisSemanticReviewerRouting> {
    const routing = AxisSemanticReviewerRoutingSchema.parse(routingInput)
    const worker = AxisSemanticReviewerWorkerIdentitySchema.parse(workerInput)

    if (sameModel(routing.correctness, worker) || (routing.security && sameModel(routing.security, worker))) {
      throw new Error('Semantic reviewer must be independent from the Worker model')
    }
    if (routing.security && sameModel(routing.correctness, routing.security)) {
      throw new Error('Correctness and security reviewers must use distinct models')
    }

    return Object.freeze({
      correctness: freezeRoute(routing.correctness),
      schemaVersion: 1 as const,
      security: routing.security ? freezeRoute(routing.security) : null,
    })
  }
}
