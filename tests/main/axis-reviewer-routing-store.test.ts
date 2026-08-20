import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisReviewerQualificationRegistry } from '../../src/main/services/axis-reviewer-qualification-registry'
import { AxisReviewerRoutingStore } from '../../src/main/services/axis-reviewer-routing-store'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = { baseUrl: 'https://api.openai.com/v1', hasApiKey: true, id: 'p1', isActive: true,
  kind: 'openai', label: 'OpenAI', model: 'worker', updatedAt: '2026-08-14T00:00:00.000Z' }

describe('AxisReviewerRoutingStore', () => {
  it('persists revisioned qualified routing and recovers it after restart', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pivot-routing-')), 'db.sqlite')
    const qualifications = new AxisReviewerQualificationRegistry(file)
    qualifications.record({ expiresAt: '2099-01-01T00:00:00.000Z', modelId: 'review', providerId: 'p1', providerRevision: provider.updatedAt,
      qualified: true, qualifiedAt: '2026-08-14T00:00:00.000Z', schemaVersion: 1, usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 5 } })
    const store = new AxisReviewerRoutingStore({ databasePath: file, providers: { get: () => provider }, qualifications })
    const saved = store.update({ expectedRevision: 0, routing: { correctness: { modelId: 'review', providerId: 'p1' }, correctnessFallback: null, enabled: true, security: null, securityFallback: null } })
    expect(saved.revision).toBe(1)
    expect(() => store.update({ expectedRevision: 0, routing: saved.routing })).toThrow(/revision/i)
    expect(store.readQualified()).toMatchObject({ revision: 1 })
    store.close(); qualifications.close()
    const reopenedQualifications = new AxisReviewerQualificationRegistry(file)
    const reopened = new AxisReviewerRoutingStore({ databasePath: file, providers: { get: () => provider }, qualifications: reopenedQualifications })
    expect(reopened.read()).toMatchObject({ revision: 1, routing: { enabled: true } })
    reopened.close(); reopenedQualifications.close()
  })

  it('rejects unqualified, provider-revision drift and Worker identity collisions', () => {
    let currentProvider = provider
    const qualifications = new AxisReviewerQualificationRegistry()
    const store = new AxisReviewerRoutingStore({ providers: { get: () => currentProvider }, qualifications })
    const routing = { correctness: { modelId: 'review', providerId: 'p1' }, correctnessFallback: null, enabled: true, security: null, securityFallback: null }
    expect(() => store.update({ expectedRevision: 0, routing })).toThrow(/qualified/i)
    currentProvider = { ...provider, isActive: false }
    expect(() => store.update({ expectedRevision: 0, routing })).toThrow(/active/i)
    currentProvider = provider
    qualifications.record({ expiresAt: '2099-01-01T00:00:00.000Z', modelId: 'worker', providerId: 'p1', providerRevision: provider.updatedAt,
      qualified: true, qualifiedAt: '2026-08-14T00:00:00.000Z', schemaVersion: 1, usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 5 } })
    expect(() => store.update({ expectedRevision: 0, routing: { ...routing, correctness: { modelId: 'worker', providerId: 'p1' } } })).toThrow(/Worker|independent/i)
    qualifications.record({ expiresAt: '2099-01-01T00:00:00.000Z', modelId: 'review', providerId: 'p1', providerRevision: provider.updatedAt,
      qualified: true, qualifiedAt: '2026-08-14T00:00:00.000Z', schemaVersion: 1, usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 5 } })
    store.update({ expectedRevision: 0, routing })
    currentProvider = { ...provider, updatedAt: '2026-08-14T00:00:01.000Z' }
    expect(store.readQualified()).toBeNull()
    store.close(); qualifications.close()
  })
})
