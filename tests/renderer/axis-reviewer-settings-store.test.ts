import { beforeEach, describe, expect, it, vi } from 'vitest'
const invoke = vi.fn(); vi.stubGlobal('window', { pivot: { invoke } })
import { useAxisReviewerSettingsStore } from '../../src/renderer/stores/axis-reviewer-settings.store'

beforeEach(() => { invoke.mockReset(); useAxisReviewerSettingsStore.setState({ config: null, error: null, evidence: null, loading: false }) })
describe('Axis Reviewer settings Store', () => {
  it('loads, qualifies and performs revisioned updates through strict IPC results', async () => {
    const routing = { correctness: { modelId: 'review', providerId: 'p1' }, correctnessFallback: null, enabled: true, security: null, securityFallback: null }
    invoke.mockResolvedValueOnce(config()).mockResolvedValueOnce(evidence()).mockResolvedValueOnce({ ...config(), revision: 2, routing })
    await useAxisReviewerSettingsStore.getState().load()
    await useAxisReviewerSettingsStore.getState().qualify('p1', 'review')
    await useAxisReviewerSettingsStore.getState().update(routing)
    expect(invoke).toHaveBeenLastCalledWith('axis:update-reviewer-routing', expect.objectContaining({ expectedRevision: 1 }))
    expect(useAxisReviewerSettingsStore.getState()).toMatchObject({ config: { revision: 2 }, evidence: { modelId: 'review' } })
  })
  it('rejects cross-owner qualification evidence', async () => {
    invoke.mockResolvedValue({ ...evidence(), providerId: 'p2' })
    await useAxisReviewerSettingsStore.getState().qualify('p1', 'review')
    expect(useAxisReviewerSettingsStore.getState().evidence).toBeNull()
    expect(useAxisReviewerSettingsStore.getState().error).toMatch(/ownership/i)
  })
  it('ignores a stale qualification response and rejects forged update revisions', async () => {
    let resolveOld!: (value: unknown) => void
    const old = new Promise((resolve) => { resolveOld = resolve })
    invoke.mockReturnValueOnce(old).mockResolvedValueOnce({ ...evidence(), evidenceId: 'new', modelId: 'review-new' })
    const first = useAxisReviewerSettingsStore.getState().qualify('p1', 'review-old')
    const second = useAxisReviewerSettingsStore.getState().qualify('p1', 'review-new')
    await second
    resolveOld({ ...evidence(), modelId: 'review-old' }); await first
    expect(useAxisReviewerSettingsStore.getState().evidence).toMatchObject({ evidenceId: 'new', modelId: 'review-new' })

    useAxisReviewerSettingsStore.setState({ config: config() })
    invoke.mockResolvedValueOnce({ ...config(), revision: 8 })
    await useAxisReviewerSettingsStore.getState().update({ correctness: null, correctnessFallback: null, enabled: false, security: null, securityFallback: null })
    expect(useAxisReviewerSettingsStore.getState().config?.revision).toBe(1)
    expect(useAxisReviewerSettingsStore.getState().error).toMatch(/revision/i)
  })
})
function config() { return { revision: 1, routing: { correctness: null, correctnessFallback: null, enabled: false, security: null, securityFallback: null }, schemaVersion: 1 as const, updatedAt: '2026-08-14T00:00:00.000Z' } }
function evidence() { return { evidenceId: 'q1', expiresAt: '2026-08-15T00:00:00.000Z', modelId: 'review', providerId: 'p1', providerRevision: '2026-08-14T00:00:00.000Z', qualified: true, qualifiedAt: '2026-08-14T00:00:00.000Z', schemaVersion: 1, usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 5 } } }
