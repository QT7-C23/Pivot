import type { AxisSemanticReviewerRouting } from '../../shared/axis-semantic-review-routing-contracts'
import type { ProviderConfig } from '../../shared/types/domain'
import type { ProviderStore } from './provider-store'
import { AiSdkAxisSemanticReviewerAdapter } from './ai-sdk-axis-semantic-reviewer-adapter'
import { AxisSemanticReviewCircuitBreaker } from './axis-semantic-review-circuit-breaker'
import { AxisFallbackSemanticReviewerAdapter } from './axis-fallback-semantic-reviewer-adapter'
import type { AxisSemanticReviewerPort } from './axis-semantic-review-port'
import { AxisSemanticReviewRoutingPolicy } from './axis-semantic-review-routing-policy'
import { AxisSegmentedSemanticReviewerAdapter } from './axis-segmented-semantic-reviewer-adapter'
import type { AxisReviewerRoutingConfig } from '../../shared/axis-reviewer-qualification-contracts'

export interface AxisSemanticReviewProductionRuntime {
  correctness: AxisSemanticReviewerPort
  security?: AxisSemanticReviewerPort
  timeoutMs: number
}

export type AxisSemanticReviewerFactory = (input: Readonly<{
  apiKey: string
  kind: 'correctness' | 'security'
  provider: ProviderConfig
  route: AxisSemanticReviewerRouting['correctness']
}>) => AxisSemanticReviewerPort

export function resolveAxisSemanticReviewProductionConfig(
  env: Readonly<Record<string, string | undefined>>,
  activeProvider: ProviderConfig | null,
): Readonly<AxisSemanticReviewerRouting> | null {
  const enabled = env['PIVOT_AXIS_SEMANTIC_REVIEW']
  if (enabled !== undefined && enabled !== '0' && enabled !== '1') {
    throw new Error('PIVOT_AXIS_SEMANTIC_REVIEW must be 0 or 1')
  }
  if (enabled !== '1') return null
  if (!activeProvider?.isActive) throw new Error('Axis semantic review requires an active provider')
  const correctnessModel = requireModel(env['PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL'], 'correctness')
  const securityModel = optionalModel(env['PIVOT_AXIS_SECURITY_REVIEW_MODEL'])
  return new AxisSemanticReviewRoutingPolicy().resolve({
    correctness: {
      maxCostUsd: 0.08,
      maxInputTokens: 80_000,
      maxOutputTokens: 4_096,
      modelId: correctnessModel,
      providerId: activeProvider.id,
    },
    schemaVersion: 1,
    security: securityModel ? {
      maxCostUsd: 0.16,
      maxInputTokens: 100_000,
      maxOutputTokens: 6_144,
      modelId: securityModel,
      providerId: activeProvider.id,
    } : null,
  }, {
    modelId: activeProvider.model,
    providerId: activeProvider.id,
  })
}

export function createAxisSemanticReviewProductionRuntime(options: {
  apiKey: string | (() => string) | null
  env: Readonly<Record<string, string | undefined>>
  provider: ProviderConfig | null
  reviewerFactory?: AxisSemanticReviewerFactory
}): AxisSemanticReviewProductionRuntime | undefined {
  const routing = resolveAxisSemanticReviewProductionConfig(options.env, options.provider)
  if (!routing) return undefined
  if (!options.provider || !options.apiKey) throw new Error('Axis semantic review requires an active provider API key')
  const apiKey = typeof options.apiKey === 'function' ? options.apiKey() : options.apiKey
  const correctnessFallback = optionalModel(options.env['PIVOT_AXIS_CORRECTNESS_FALLBACK_REVIEW_MODEL'])
  const securityFallback = optionalModel(options.env['PIVOT_AXIS_SECURITY_FALLBACK_REVIEW_MODEL'])
  if (securityFallback && !routing.security) {
    throw new Error('Axis security fallback Reviewer requires a security primary Reviewer')
  }
  assertDistinctReviewerModels(options.provider, routing, correctnessFallback, securityFallback)
  const correctness = reviewer(
    options.provider, apiKey, 'correctness', routing.correctness, correctnessFallback, options.reviewerFactory,
  )
  const security = routing.security
    ? reviewer(options.provider, apiKey, 'security', routing.security, securityFallback, options.reviewerFactory)
    : undefined
  return Object.freeze({ correctness, security, timeoutMs: 60_000 })
}

export function createAxisSemanticReviewProductionRuntimeFromStore(
  providers: Pick<ProviderStore, 'list' | 'readSecret'>,
  env: Readonly<Record<string, string | undefined>>,
): AxisSemanticReviewProductionRuntime | undefined {
  const provider = providers.list().find((candidate) => candidate.isActive) ?? null
  return createAxisSemanticReviewProductionRuntime({
    apiKey: provider ? () => providers.readSecret(provider.id) : null,
    env,
    provider,
  })
}

export function createAxisSemanticReviewProductionRuntimeFromRouting(
  providers: Pick<ProviderStore, 'get' | 'readSecret'>,
  config: AxisReviewerRoutingConfig,
): AxisSemanticReviewProductionRuntime | undefined {
  if (!config.routing.enabled || !config.routing.correctness) return undefined
  const identity = config.routing.correctness
  const provider = providers.get(identity.providerId)
  if (!provider?.hasApiKey) throw new Error('Axis semantic review configured Provider is unavailable')
  const env: Record<string, string> = {
    PIVOT_AXIS_SEMANTIC_REVIEW: '1',
    PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL: identity.modelId,
  }
  if (config.routing.security) env['PIVOT_AXIS_SECURITY_REVIEW_MODEL'] = config.routing.security.modelId
  if (config.routing.correctnessFallback) env['PIVOT_AXIS_CORRECTNESS_FALLBACK_REVIEW_MODEL'] = config.routing.correctnessFallback.modelId
  if (config.routing.securityFallback) env['PIVOT_AXIS_SECURITY_FALLBACK_REVIEW_MODEL'] = config.routing.securityFallback.modelId
  return createAxisSemanticReviewProductionRuntime({ apiKey: () => providers.readSecret(provider.id), env, provider })
}

function reviewer(
  provider: ProviderConfig,
  apiKey: string,
  kind: 'correctness' | 'security',
  route: AxisSemanticReviewerRouting['correctness'],
  fallbackModel: string | null,
  reviewerFactory?: AxisSemanticReviewerFactory,
): AxisSemanticReviewerPort {
  const primary = circuitBreaker(createReviewer(provider, apiKey, kind, route, reviewerFactory))
  const selected = fallbackModel
    ? new AxisFallbackSemanticReviewerAdapter(
        primary,
        circuitBreaker(createReviewer(provider, apiKey, kind, { ...route, modelId: fallbackModel }, reviewerFactory)),
      )
    : primary
  return new AxisSegmentedSemanticReviewerAdapter(selected)
}

function createReviewer(
  provider: ProviderConfig,
  apiKey: string,
  kind: 'correctness' | 'security',
  route: AxisSemanticReviewerRouting['correctness'],
  reviewerFactory?: AxisSemanticReviewerFactory,
): AxisSemanticReviewerPort {
  return reviewerFactory?.({ apiKey, kind, provider, route })
    ?? new AiSdkAxisSemanticReviewerAdapter(provider, apiKey, { kind, route })
}

function circuitBreaker(reviewer: AxisSemanticReviewerPort): AxisSemanticReviewerPort {
  return new AxisSemanticReviewCircuitBreaker(
    reviewer,
    { cooldownMs: 30_000, failureThreshold: 3 },
  )
}

function assertDistinctReviewerModels(
  provider: ProviderConfig,
  routing: Readonly<AxisSemanticReviewerRouting>,
  correctnessFallback: string | null,
  securityFallback: string | null,
): void {
  const roles = [
    ['Worker', provider.model],
    ['correctness Reviewer', routing.correctness.modelId],
    ...(routing.security ? [['security Reviewer', routing.security.modelId]] : []),
    ...(correctnessFallback ? [['correctness fallback Reviewer', correctnessFallback]] : []),
    ...(securityFallback ? [['security fallback Reviewer', securityFallback]] : []),
  ] as const
  const owners = new Map<string, string>()
  for (const [role, model] of roles) {
    const previous = owners.get(model)
    if (previous) throw new Error(`${role} model must be independent from ${previous}`)
    owners.set(model, role)
  }
}

function requireModel(value: string | undefined, kind: string): string {
  const model = optionalModel(value)
  if (!model) throw new Error(`Axis semantic review requires a ${kind} Reviewer model`)
  return model
}

function optionalModel(value: string | undefined): string | null {
  const model = value?.trim()
  if (!model) return null
  if (model.length > 160) throw new Error('Axis semantic Reviewer model identifier is too long')
  return model
}
