import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/axis-reviewer-settings-ipc', () => ({ registerAxisReviewerSettingsIpc: vi.fn() }))

import { createAxisReviewerSettingsRuntime } from '../../src/main/axis-reviewer-settings-runtime'
import { AxisReviewerQualificationRegistry } from '../../src/main/services/axis-reviewer-qualification-registry'
import { AxisReviewerRoutingStore } from '../../src/main/services/axis-reviewer-routing-store'
import { ProviderStore } from '../../src/main/services/provider-store'

const cipher = { decrypt: (value: string) => value, encrypt: (value: string) => value }

describe('Axis Reviewer settings production runtime', () => {
  it('revalidates a persisted qualified route after restart before composing semantic review', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pivot-reviewer-runtime-')), 'db.sqlite')
    const providers = new ProviderStore(cipher, file)
    providers.save({ apiKey: 'secret', baseUrl: 'https://api.openai.com/v1', id: 'openai', kind: 'openai', label: 'OpenAI', model: 'worker' })
    const provider = providers.setActive('openai')
    const qualifications = new AxisReviewerQualificationRegistry(file)
    qualifications.record({ expiresAt: '2099-01-01T00:00:00.000Z', modelId: 'review', providerId: provider.id,
      providerRevision: provider.updatedAt, qualified: true, qualifiedAt: '2026-08-14T00:00:00.000Z', schemaVersion: 1,
      usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 5 } })
    const routing = new AxisReviewerRoutingStore({ databasePath: file, providers, qualifications })
    routing.update({ expectedRevision: 0, routing: { correctness: { modelId: 'review', providerId: provider.id }, correctnessFallback: null, enabled: true, security: null, securityFallback: null } })
    routing.close(); qualifications.close()

    const runtime = createAxisReviewerSettingsRuntime(providers, file)
    expect(runtime.semanticReview?.correctness.identity).toMatchObject({ modelId: 'review', providerId: provider.id })
    runtime.close(); providers.close()
  })
})
