import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AxisReviewerQualificationRegistry } from '../../src/main/services/axis-reviewer-qualification-registry'
import { AxisReviewerQualificationService } from '../../src/main/services/axis-reviewer-qualification-service'
import type { ProviderConfig } from '../../src/shared/types/domain'

const provider: ProviderConfig = { baseUrl: 'https://api.openai.com/v1', hasApiKey: true, id: 'p1', isActive: true,
  kind: 'openai', label: 'OpenAI', model: 'worker', updatedAt: '2026-08-14T00:00:00.000Z' }

describe('Axis Reviewer qualification', () => {
  it('persists bounded measured evidence across restart and invalidates provider revision drift', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pivot-qualification-')), 'db.sqlite')
    const registry = new AxisReviewerQualificationRegistry(file)
    const now = new Date()
    const currentProvider = { ...provider, updatedAt: now.toISOString() }
    const runner = vi.fn().mockResolvedValue({ output: { nonce: 'pivot-reviewer-qualified', schemaVersion: 1 }, usage: { costUsd: 0.001, inputTokens: 20, outputTokens: 10 } })
    const service = new AxisReviewerQualificationService({ clock: () => now.getTime(), evidence: registry, providers: { get: () => currentProvider, readSecret: () => 'secret' }, runner: { qualify: runner } })
    const evidence = await service.qualify({ modelId: 'review', providerId: 'p1' })
    registry.close()
    const reopened = new AxisReviewerQualificationRegistry(file)
    expect(reopened.findCurrent('p1', 'review', currentProvider.updatedAt)?.evidenceId).toBe(evidence.evidenceId)
    expect(reopened.findCurrent('p1', 'review', new Date(now.getTime() + 1).toISOString())).toBeNull()
    reopened.close()
  })

  it('rejects malformed output, timeout and usage over budget without evidence', async () => {
    const registry = new AxisReviewerQualificationRegistry()
    const runner = { qualify: vi.fn().mockResolvedValue({ output: { bad: true }, usage: { costUsd: 0.02, inputTokens: 1, outputTokens: 1 } }) }
    const service = new AxisReviewerQualificationService({ evidence: registry, providers: { get: () => provider, readSecret: () => 'secret' }, runner, timeoutMs: 20 })
    await expect(service.qualify({ modelId: 'review', providerId: 'p1' })).rejects.toThrow(/output|budget|qualification/i)
    let aborted = false
    runner.qualify.mockImplementationOnce(({ signal }: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')) }, { once: true })
    }) as never)
    await expect(service.qualify({ modelId: 'review', providerId: 'p1' })).rejects.toThrow(/timeout/i)
    expect(aborted).toBe(true)
    expect(registry.findCurrent('p1', 'review', provider.updatedAt)).toBeNull()
    registry.close()
  })

  it('replaces expired evidence when the same Provider revision is requalified', () => {
    const registry = new AxisReviewerQualificationRegistry()
    const base = { modelId: 'review', providerId: 'p1', providerRevision: provider.updatedAt, qualified: true as const,
      qualifiedAt: '2026-08-13T00:00:00.000Z', schemaVersion: 1 as const, usage: { costUsd: 0.001, inputTokens: 10, outputTokens: 5 } }
    const expired = registry.record({ ...base, expiresAt: '2026-08-13T01:00:00.000Z' })
    const renewed = registry.record({ ...base, expiresAt: '2099-01-01T00:00:00.000Z', qualifiedAt: '2026-08-14T00:00:00.000Z' })
    expect(renewed.evidenceId).not.toBe(expired.evidenceId)
    expect(registry.findCurrent('p1', 'review', provider.updatedAt)?.evidenceId).toBe(renewed.evidenceId)
    registry.close()
  })
})
