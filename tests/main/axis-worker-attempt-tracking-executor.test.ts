import { describe, expect, it, vi } from 'vitest'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisWorkerAttemptRegistry } from '../../src/main/services/axis-worker-attempt-registry'
import { AxisWorkerAttemptTrackingExecutor } from '../../src/main/services/axis-worker-attempt-tracking-executor'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis Worker attempt tracking executor', () => {
  it('records the authoritative running task attempt and terminal result', async () => {
    const states = new AxisRunStateRegistry()
    const attempts = new AxisWorkerAttemptRegistry()
    const state = runningState(states)
    const delegate = {
      execute: vi.fn(async () => workerResult('failed', 'Simulator failed')),
    }
    const executor = new AxisWorkerAttemptTrackingExecutor({
      attempts: attempts.openLifecyclePort(),
      delegate,
      states: states.openPivotActionReaderPort(),
      workerId: 'dry-run-worker',
    })

    await expect(executor.execute({
      mode: 'dry-run',
      runId: state.runId,
      sessionId: state.sessionId,
      task: axisShadowResult().dag!.tasks[0]!,
    })).resolves.toMatchObject({ status: 'failed' })

    expect(attempts.openReaderPort().findLatest({
      runId: state.runId,
      sessionId: state.sessionId,
      taskId: 'inspect',
    })).toMatchObject({
      attempt: 1,
      error: 'Simulator failed',
      status: 'failed',
      workerId: 'dry-run-worker',
    })
    attempts.close()
    states.close()
  })

  it('records thrown and cross-task executor failures before propagating them', async () => {
    for (const delegate of [
      { execute: vi.fn(async () => { throw new Error('delegate crashed') }) },
      { execute: vi.fn(async () => ({ ...workerResult('completed', 'wrong'), taskId: 'other' })) },
    ]) {
      const states = new AxisRunStateRegistry()
      const attempts = new AxisWorkerAttemptRegistry()
      const state = runningState(states)
      const executor = new AxisWorkerAttemptTrackingExecutor({
        attempts: attempts.openLifecyclePort(),
        delegate,
        states: states.openPivotActionReaderPort(),
        workerId: 'dry-run-worker',
      })

      await expect(executor.execute({
        mode: 'dry-run',
        runId: state.runId,
        sessionId: state.sessionId,
        task: axisShadowResult().dag!.tasks[0]!,
      })).rejects.toThrow()
      expect(attempts.openReaderPort().findLatest({
        runId: state.runId,
        sessionId: state.sessionId,
        taskId: 'inspect',
      })).toMatchObject({ status: 'failed' })
      attempts.close()
      states.close()
    }
  })

  it('rejects execution unless the authoritative task is running', async () => {
    const states = new AxisRunStateRegistry()
    const attempts = new AxisWorkerAttemptRegistry()
    states.create(axisShadowResult(), axisBudget())
    const delegate = { execute: vi.fn() }
    const executor = new AxisWorkerAttemptTrackingExecutor({
      attempts: attempts.openLifecyclePort(),
      delegate,
      states: states.openPivotActionReaderPort(),
      workerId: 'dry-run-worker',
    })

    await expect(executor.execute({
      mode: 'dry-run',
      runId: 'run-1',
      sessionId: 'session-1',
      task: axisShadowResult().dag!.tasks[0]!,
    })).rejects.toThrow(/running/i)
    expect(delegate.execute).not.toHaveBeenCalled()
    attempts.close()
    states.close()
  })
})

function runningState(states: AxisRunStateRegistry) {
  let state = states.create(axisShadowResult(), {
    ...axisBudget(),
    maxRetriesPerTask: 2,
  })
  state = states.startDryRun({
    approvedTaskIds: ['inspect'],
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
  })
  return states.startTask({
    expectedRevision: state.revision,
    runId: state.runId,
    sessionId: state.sessionId,
    taskId: 'inspect',
  })
}

function workerResult(status: 'completed' | 'failed', summary: string) {
  return {
    artifacts: [],
    findings: [],
    status,
    summary,
    taskId: 'inspect',
    usage: { costUsd: 0, durationMs: 1, tokens: 0 },
  }
}
