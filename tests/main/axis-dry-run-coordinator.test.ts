import { describe, expect, it, vi } from 'vitest'
import { AxisDryRunCoordinator } from '../../src/main/services/axis-dry-run-coordinator'
import { AxisDryRunQualityEvaluator, type AxisExecutionQualityEvaluator } from '../../src/main/services/axis-execution-quality'
import type { AxisTaskExecutor, AxisTaskExecutorInput } from '../../src/main/services/axis-task-executor'
import type { AxisCheckpointEvaluation, AxisPermissionEvaluation, AxisReviewEvaluation, WorkerResult } from '../../src/shared/axis-engine-contracts'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis dry-run coordinator', () => {
  it('simulates an approved DAG to completion without tool authority', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor: AxisTaskExecutor = { execute: vi.fn(async ({ task }: AxisTaskExecutorInput): Promise<WorkerResult> => ({
      artifacts: [], findings: [`Would request: ${task.requiredTools.join(', ')}`], status: 'completed',
      summary: 'Simulation only', taskId: task.id, usage: { costUsd: 0, durationMs: 2, tokens: 0 },
    })) }

    const result = await coordinator(executor, states).execute(plan, {
      approvedTaskIds: ['inspect'], expectedRevision: 1, runId: 'run-1', sessionId: 'session-1',
    })

    expect(result).toMatchObject({ status: 'completed', tasks: [{ status: 'completed' }] })
    expect(executor.execute).toHaveBeenCalledOnce()
    states.close()
  })

  it('pauses after measured dry-run usage exceeds the original hard budget', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, { ...axisBudget(), maxTokens: 10 })
    const executor: AxisTaskExecutor = { execute: vi.fn(async ({ task }: AxisTaskExecutorInput): Promise<WorkerResult> => ({
      artifacts: [], findings: [], status: 'completed', summary: 'Measured simulation', taskId: task.id,
      usage: { costUsd: 0, durationMs: 2, tokens: 11 },
    })) }

    const result = await coordinator(executor, states).execute(plan, {
      approvedTaskIds: ['inspect'], expectedRevision: 1, runId: 'run-1', sessionId: 'session-1',
    })

    expect(result).toMatchObject({ status: 'paused' })
    expect(result.events.at(-1)).toMatchObject({ detail: 'token-limit', type: 'paused' })
    states.close()
  })

  it('does not invoke the executor when persisted usage already exceeds budget', async () => {
    const states = registry()
    const plan = { ...axisShadowResult(), usage: { ...axisShadowResult().usage, tokens: 11 } }
    states.create(plan, { ...axisBudget(), maxTokens: 10 })
    const executor: AxisTaskExecutor = { execute: vi.fn() }

    const result = await coordinator(executor, states).execute(plan, {
      approvedTaskIds: ['inspect'], expectedRevision: 1, runId: 'run-1', sessionId: 'session-1',
    })

    expect(result).toMatchObject({ status: 'paused' })
    expect(executor.execute).not.toHaveBeenCalled()
    states.close()
  })

  it('persists executor exceptions as a failed task and run', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor: AxisTaskExecutor = { execute: vi.fn(async () => { throw new Error('simulator failed') }) }

    const result = await coordinator(executor, states).execute(plan, {
      approvedTaskIds: ['inspect'], expectedRevision: 1, runId: 'run-1', sessionId: 'session-1',
    })

    expect(result).toMatchObject({ status: 'failed', tasks: [{ error: 'simulator failed', status: 'failed' }] })
    expect(states.get('run-1')?.events.at(-1)).toMatchObject({ taskId: 'inspect', type: 'task-failed' })
    states.close()
  })

  it('persists mismatched executor results as a failed scheduled task', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor: AxisTaskExecutor = { execute: vi.fn(async (): Promise<WorkerResult> => ({
      artifacts: [], findings: [], status: 'completed', summary: 'wrong task', taskId: 'another-task',
      usage: { costUsd: 0, durationMs: 0, tokens: 0 },
    })) }

    const result = await coordinator(executor, states).execute(plan, approval())

    expect(result).toMatchObject({ status: 'failed', tasks: [{ error: expect.stringContaining('scheduled task contract'), status: 'failed', taskId: 'inspect' }] })
    states.close()
  })

  it('fails before executor invocation when simulated permission is denied', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor: AxisTaskExecutor = { execute: vi.fn() }
    const quality = scriptedQuality({ permission: permission('denied') })

    const result = await coordinator(executor, states, quality).execute(plan, approval())

    expect(result).toMatchObject({ status: 'failed', tasks: [{ status: 'failed' }] })
    expect(result.events.at(-1)).toMatchObject({ taskId: 'inspect', type: 'permission-denied' })
    expect(executor.execute).not.toHaveBeenCalled()
    states.close()
  })

  it('fails closed when permission evidence does not match the scheduled task', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor: AxisTaskExecutor = { execute: vi.fn() }
    const quality = scriptedQuality({ permission: { ...permission('allowed'), requestedTools: [] } })

    const result = await coordinator(executor, states, quality).execute(plan, approval())

    expect(result).toMatchObject({ status: 'failed', tasks: [{ status: 'failed' }] })
    expect(result.events.at(-1)).toMatchObject({ detail: expect.stringContaining('scheduled task contract'), type: 'permission-denied' })
    expect(executor.execute).not.toHaveBeenCalled()
    states.close()
  })

  it('fails before executor invocation when simulated checkpoint preparation fails', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor: AxisTaskExecutor = { execute: vi.fn() }
    const quality = scriptedQuality({ checkpoint: checkpoint('failed') })

    const result = await coordinator(executor, states, quality).execute(plan, approval())

    expect(result).toMatchObject({ status: 'failed', tasks: [{ status: 'failed' }] })
    expect(result.events.map((event) => event.type)).toContain('checkpoint-failed')
    expect(executor.execute).not.toHaveBeenCalled()
    states.close()
  })

  it('persists Reviewer Gate rejection when no retry is allowed', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, axisBudget())
    const executor = completedExecutor()
    const quality = scriptedQuality({ review: review('failed') })

    const result = await coordinator(executor, states, quality).execute(plan, approval())

    expect(result).toMatchObject({ status: 'failed', tasks: [{ attempts: 1, status: 'failed' }] })
    expect(result.events.at(-1)).toMatchObject({ detail: expect.stringContaining('retry-limit'), type: 'review-failed' })
    expect(result.usage.gateCyclesForFile).toBe(1)
    states.close()
  })

  it('retries only up to the original task retry limit', async () => {
    const states = registry()
    const plan = axisShadowResult()
    states.create(plan, { ...axisBudget(), maxGateCyclesPerFile: 3, maxRetriesPerTask: 1 })
    const executor = completedExecutor()
    const quality = scriptedQuality({ review: review('failed') })

    const result = await coordinator(executor, states, quality).execute(plan, approval())

    expect(executor.execute).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ status: 'failed', tasks: [{ attempts: 2, status: 'failed' }] })
    expect(result.usage).toMatchObject({ gateCyclesForFile: 2, retriesForTask: 1 })
    expect(result.events.map((event) => event.type)).toContain('retry-scheduled')
    expect(result.events.at(-1)).toMatchObject({ detail: expect.stringContaining('retry-limit'), type: 'review-failed' })
    states.close()
  })
})

function approval() {
  return { approvedTaskIds: ['inspect'], expectedRevision: 1, runId: 'run-1', sessionId: 'session-1' }
}

function completedExecutor(): AxisTaskExecutor {
  return { execute: vi.fn(async ({ task }: AxisTaskExecutorInput): Promise<WorkerResult> => ({
    artifacts: [], findings: [], status: 'completed', summary: 'Simulation only', taskId: task.id,
    usage: { costUsd: 0, durationMs: 1, tokens: 0 },
  })) }
}

function coordinator(executor: AxisTaskExecutor, states: AxisRunStateRegistry, quality: AxisExecutionQualityEvaluator = new AxisDryRunQualityEvaluator()) {
  return new AxisDryRunCoordinator({ executor, quality, states })
}

function permission(status: AxisPermissionEvaluation['status']): AxisPermissionEvaluation {
  return { authority: 'simulation', evidence: ['scripted permission'], requestedTools: ['read'], status, taskId: 'inspect' }
}

function checkpoint(status: AxisCheckpointEvaluation['status']): AxisCheckpointEvaluation {
  return { authority: 'simulation', checkpointIds: [], evidence: ['scripted checkpoint'], filePaths: [], status, taskId: 'inspect' }
}

function review(status: AxisReviewEvaluation['status']): AxisReviewEvaluation {
  return {
    authority: 'simulation', gates: [{ durationMs: 0, evidence: ['scripted review'], gate: 'correctness', status: status === 'passed' ? 'passed' : 'failed', taskId: 'inspect' }],
    status, summary: `scripted review ${status}`, taskId: 'inspect',
  }
}

function scriptedQuality(options: { checkpoint?: AxisCheckpointEvaluation; permission?: AxisPermissionEvaluation; review?: AxisReviewEvaluation }): AxisExecutionQualityEvaluator {
  return {
    evaluateCheckpoint: vi.fn(async () => options.checkpoint ?? checkpoint('skipped')),
    evaluatePermission: vi.fn(async () => options.permission ?? permission('allowed')),
    review: vi.fn(async () => options.review ?? review('passed')),
  }
}

function registry(): AxisRunStateRegistry {
  let second = 0
  return new AxisRunStateRegistry(':memory:', {
    clock: () => new Date(`2026-07-22T02:00:${String(second++).padStart(2, '0')}.000Z`),
  })
}
