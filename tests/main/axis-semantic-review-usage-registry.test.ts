import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AxisSemanticReviewUsageRegistry } from '../../src/main/services/axis-semantic-review-usage-registry'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })))

describe('AxisSemanticReviewUsageRegistry', () => {
  it('persists bounded usage across restart', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pivot-review-usage-')); roots.push(root)
    const databasePath = path.join(root, 'usage.db')
    const input = {
      budget: { maxCostUsd: 0.01, maxInputTokens: 100, maxOutputTokens: 20 }, costUsd: 0.002,
      inputTokens: 80, kind: 'correctness' as const, modelId: 'review-small', outputTokens: 10,
      providerId: 'provider-review', requestId: 'request-1', runId: 'run-1', schemaVersion: 1 as const,
      sessionId: 'session-1', status: 'within-budget' as const, taskId: 'task-1',
    }
    let registry = new AxisSemanticReviewUsageRegistry(databasePath)
    registry.record(input); registry.close()
    registry = new AxisSemanticReviewUsageRegistry(databasePath)
    const reader = registry.openReaderPort()
    expect(reader.listForSession('session-1', 10)).toMatchObject({ hasMore: false, items: [{ requestId: 'request-1' }] })
    expect(reader.listForSession('session-2', 10)).toEqual({ hasMore: false, items: [] })
    expect(reader).not.toHaveProperty('record')
    expect(registry.listForRun('run-1')).toMatchObject([{ inputTokens: 80, outputTokens: 10, sequence: 1 }])
    registry.close()
  })
})
