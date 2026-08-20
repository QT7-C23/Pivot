import { describe, expect, it, vi } from 'vitest'
import { AxisPivotReplanReviewedTaskOrchestrator } from '../../src/main/services/axis-pivot-replan-reviewed-task-orchestrator'
import { AxisPivotReplanReviewedTaskRegistry } from '../../src/main/services/axis-pivot-replan-reviewed-task-registry'
import { replanAuthorization, scheduledTaskEvidence } from '../fixtures/axis-pivot-replan-task-scheduling'
import {
  replanChildContinuationAttempt,
  replanChildProposalResult,
} from '../fixtures/axis-pivot-replan-reviewed-task'

describe('AxisPivotReplanReviewedTaskOrchestrator', () => {
  it('derives proposal and submission exclusively from persisted schedule evidence', async () => {
    const propose = vi.fn(async () => replanChildProposalResult())
    const consume = vi.fn(async () => replanChildContinuationAttempt())
    const fixture = createOrchestrator({ consume, propose })

    const first = await fixture.orchestrator.orchestrate({
      scheduleId: 'replan-schedule-1',
    })
    const duplicate = await fixture.orchestrator.orchestrate({
      scheduleId: 'replan-schedule-1',
    })

    expect(first).toMatchObject({
      action: 'replan',
      childStateRevision: 1,
      continuationAttempt: { submittedTaskId: 'child-task-1' },
      scheduleId: 'replan-schedule-1',
      status: 'completed',
    })
    expect(duplicate).toEqual(first)
    expect(propose).toHaveBeenCalledOnce()
    expect(propose).toHaveBeenCalledWith({
      expectedRevision: 1,
      runId: 'run-child-1',
      sessionId: 'session-1',
      taskId: 'child-task-1',
    })
    expect(consume).toHaveBeenCalledOnce()
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({
      decisionId: 'decision-replan-1',
      handoffId: 'handoff-replan-1',
      submission: expect.objectContaining({
        expectedRevision: 2,
        runId: 'run-child-1',
        taskId: 'child-task-1',
      }),
    }))
    fixture.close()
  })

  it('rejects schedule/authorization drift before proposal generation', async () => {
    const propose = vi.fn(async () => replanChildProposalResult())
    const schedule = { ...scheduledTaskEvidence(), decisionId: 'forged-decision' }
    const fixture = createOrchestrator({ propose, schedule })

    await expect(fixture.orchestrator.orchestrate({
      scheduleId: schedule.scheduleId,
    })).rejects.toThrow(/authorization|schedule|ownership|handoff/i)
    expect(propose).not.toHaveBeenCalled()
    fixture.close()
  })
})

function createOrchestrator(options: {
  consume?: ReturnType<typeof vi.fn>
  propose: ReturnType<typeof vi.fn>
  schedule?: ReturnType<typeof scheduledTaskEvidence>
}) {
  const orchestrations = new AxisPivotReplanReviewedTaskRegistry(':memory:', {
    clock: () => new Date('2026-08-02T01:00:00.000Z'),
    idFactory: () => 'replan-reviewed-task-1',
  })
  return {
    close: () => orchestrations.close(),
    orchestrator: new AxisPivotReplanReviewedTaskOrchestrator({
      authorization: { find: () => replanAuthorization() },
      continuations: {
        consume: options.consume ?? vi.fn(async () => replanChildContinuationAttempt()),
      },
      orchestrations,
      proposals: { propose: options.propose },
      schedules: { find: () => options.schedule ?? scheduledTaskEvidence() },
    }),
  }
}
