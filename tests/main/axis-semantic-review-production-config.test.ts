import { describe, expect, it } from 'vitest'
import { resolveAxisSemanticReviewProductionConfig } from '../../src/main/services/axis-semantic-review-production-config'
import { createAxisSemanticReviewProductionRuntime } from '../../src/main/services/axis-semantic-review-production-config'
import { createAxisSemanticReviewProductionRuntimeFromRouting } from '../../src/main/services/axis-semantic-review-production-config'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = {
  baseUrl: 'https://api.example.com/v1', hasApiKey: true, id: 'provider-1', isActive: true,
  kind: 'custom', label: 'Provider', model: 'worker-model', updatedAt: '',
}

describe('Axis semantic review production config', () => {
  it('is default-off and rejects malformed enable flags', () => {
    expect(resolveAxisSemanticReviewProductionConfig({}, provider)).toBeNull()
    expect(createAxisSemanticReviewProductionRuntime({ apiKey: null, env: {}, provider: null })).toBeUndefined()
    expect(() => resolveAxisSemanticReviewProductionConfig({ PIVOT_AXIS_SEMANTIC_REVIEW: 'yes' }, provider)).toThrow(/0 or 1/i)
  })

  it('resolves code-owned budgets and independent configured Reviewer models', () => {
    const config = resolveAxisSemanticReviewProductionConfig({
      PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL: 'review-small',
      PIVOT_AXIS_SECURITY_REVIEW_MODEL: 'review-strong',
      PIVOT_AXIS_SEMANTIC_REVIEW: '1',
    }, provider)
    expect(config).toMatchObject({
      correctness: { modelId: 'review-small', providerId: 'provider-1' },
      security: { modelId: 'review-strong', providerId: 'provider-1' },
    })
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('composes a segmented primary/fallback production path with actual selected identity', async () => {
    const runtime = createAxisSemanticReviewProductionRuntime({
      apiKey: 'secret',
      env: {
        PIVOT_AXIS_CORRECTNESS_FALLBACK_REVIEW_MODEL: 'review-fallback',
        PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL: 'review-primary',
        PIVOT_AXIS_SEMANTIC_REVIEW: '1',
      },
      provider,
      reviewerFactory: ({ route }) => ({
        identity: { independentFromWorker: true, modelId: route.modelId, providerId: route.providerId, readOnlyTools: true },
        route,
        async review(request) {
          if (route.modelId === 'review-primary') throw new Error('injected provider failure')
          return {
            proposal: { confidence: 0.9, findings: [], kind: request.kind, requestId: request.requestId, schemaVersion: 1, summary: 'fallback pass', verdict: 'passed' },
            usage: { costUsd: 0.001, inputTokens: 2, outputTokens: 1 },
          }
        },
      }),
    })
    const request = {
      changedFiles: [{ afterSha256: 'b'.repeat(64), beforeSha256: null, filePath: 'src/a.ts' }], diff: '+x',
      diffSha256: 'c'.repeat(64), kind: 'correctness' as const, objective: 'review', requestId: 'r-1', runId: 'run-1',
      schemaVersion: 1 as const, sessionId: 's-1', taskId: 't-1',
    }
    await expect(runtime!.correctness.review(request)).resolves.toMatchObject({ reviewer: { modelId: 'review-fallback' } })
  })

  it('fails closed without an active provider or with a Worker model reused as Reviewer', () => {
    const env = { PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL: 'worker-model', PIVOT_AXIS_SEMANTIC_REVIEW: '1' }
    expect(() => resolveAxisSemanticReviewProductionConfig(env, null)).toThrow(/active provider/i)
    expect(() => resolveAxisSemanticReviewProductionConfig(env, provider)).toThrow(/worker/i)
    expect(() => createAxisSemanticReviewProductionRuntime({
      apiKey: 'secret',
      env: {
        PIVOT_AXIS_CORRECTNESS_FALLBACK_REVIEW_MODEL: 'review-primary',
        PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL: 'review-primary',
        PIVOT_AXIS_SEMANTIC_REVIEW: '1',
      },
      provider,
    })).toThrow(/independent/i)
    expect(() => createAxisSemanticReviewProductionRuntime({
      apiKey: 'secret',
      env: {
        PIVOT_AXIS_CORRECTNESS_REVIEW_MODEL: 'review-primary',
        PIVOT_AXIS_SECURITY_FALLBACK_REVIEW_MODEL: 'security-fallback',
        PIVOT_AXIS_SEMANTIC_REVIEW: '1',
      },
      provider,
    })).toThrow(/security.*primary/i)
  })

  it('constructs only an explicitly enabled durable qualified routing snapshot', () => {
    const providers = { get: (id: string) => id === provider.id ? provider : null, readSecret: () => 'secret' }
    const base = { revision: 1, schemaVersion: 1 as const, updatedAt: '2026-08-14T00:00:00.000Z' }
    expect(createAxisSemanticReviewProductionRuntimeFromRouting(providers, { ...base, routing: { correctness: null, correctnessFallback: null, enabled: false, security: null, securityFallback: null } })).toBeUndefined()
    const runtime = createAxisSemanticReviewProductionRuntimeFromRouting(providers, { ...base, routing: { correctness: { modelId: 'review', providerId: provider.id }, correctnessFallback: null, enabled: true, security: null, securityFallback: null } })
    expect(runtime?.correctness.identity).toMatchObject({ modelId: 'review', providerId: provider.id })
  })

})
