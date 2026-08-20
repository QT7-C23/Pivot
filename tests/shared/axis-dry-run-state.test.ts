import { describe, expect, it } from 'vitest'
import {
  completeAxisDryRun,
  completeAxisTask,
  createAxisRunState,
  startAxisDryRun,
  startAxisTask,
} from '../../src/shared/axis-run-state'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis dry-run state transitions', () => {
  it('requires exact task approval and records every simulated transition', () => {
    const initial = createAxisRunState(axisShadowResult(), axisBudget(), at(0))
    expect(() => startAxisDryRun(initial, ['other-task'], at(1))).toThrow(/exactly match/i)

    const running = startAxisDryRun(initial, ['inspect'], at(1))
    const taskRunning = startAxisTask(running, 'inspect', at(2))
    const taskCompleted = completeAxisTask(taskRunning, {
      artifacts: [], findings: ['No tools executed'], status: 'completed', summary: 'Dry run complete', taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 5, tokens: 0 },
    }, at(3))
    const completed = completeAxisDryRun(taskCompleted, at(4))

    expect(completed).toMatchObject({ revision: 5, status: 'completed', tasks: [{ attempts: 1, status: 'completed' }] })
    expect(completed.events.map((event) => event.type)).toEqual([
      'initialized', 'dry-run-started', 'task-started', 'task-completed', 'completed',
    ])
    expect(completed.usage.durationMs).toBe(5)
  })

  it('rejects task completion unless that task is running', () => {
    const initial = createAxisRunState(axisShadowResult(), axisBudget(), at(0))
    const running = startAxisDryRun(initial, ['inspect'], at(1))
    expect(() => completeAxisTask(running, {
      artifacts: [], findings: [], status: 'completed', summary: '', taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 0, tokens: 0 },
    }, at(2))).toThrow(/running/i)
  })
})

function at(second: number): string {
  return `2026-07-22T02:00:${String(second).padStart(2, '0')}.000Z`
}
