import { describe, expect, it, vi } from 'vitest'
import { AxisDryRunIpcOrchestrator } from '../../src/main/axis-dry-run-ipc-orchestrator'

describe('AxisDryRunIpcOrchestrator', () => {
  it('drives retry failure into a replan continuation and returns the authoritative state', async () => {
    const failed = {
      events: [{ type: 'task-failed' }], revision: 3, runId: 'run-1', sessionId: 'session-1', status: 'failed',
    }
    const guardedResult = {
      execution: { status: 'failed' },
      runState: { revision: 4, runId: 'run-1', sessionId: 'session-1' },
    }
    const observeFailure = vi.fn()
      .mockResolvedValueOnce({ decisionId: 'decision-retry', result: { action: 'retry' }, route: 'continuation' })
      .mockResolvedValueOnce({ decisionId: 'decision-replan', result: { action: 'replan' }, route: 'continuation' })
    const drive = vi.fn(async () => undefined)
    const authoritative = { ...failed, revision: 5 }
    const orchestrator = new AxisDryRunIpcOrchestrator({
      execute: vi.fn(async () => failed as never),
      failureObserver: { observeFailure },
      replanDriver: { drive },
      reviewedContinuations: { orchestrate: vi.fn(async () => ({ continuationAttempt: { guardedResult } }) as never) },
      stateReader: { get: vi.fn(() => authoritative as never) },
    })

    await expect(orchestrator.execute({} as never)).resolves.toBe(authoritative)
    expect(observeFailure).toHaveBeenCalledTimes(2)
    expect(drive).toHaveBeenCalledWith({ decisionId: 'decision-replan' })
  })
})
