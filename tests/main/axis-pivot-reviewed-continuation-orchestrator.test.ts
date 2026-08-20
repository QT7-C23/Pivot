import { describe, expect, it, vi } from 'vitest'
import { AxisSafeWriteProposalService } from '../../src/main/services/axis-safe-write-proposal'
import { AxisPivotContinuationAttemptRegistry } from '../../src/main/services/axis-pivot-continuation-attempt-registry'
import { AxisPivotGuardedContinuationConsumer } from '../../src/main/services/axis-pivot-guarded-continuation-consumer'
import { AxisPivotReviewedContinuationOrchestrator } from '../../src/main/services/axis-pivot-reviewed-continuation-orchestrator'
import { AxisPivotReviewedContinuationRegistry } from '../../src/main/services/axis-pivot-reviewed-continuation-registry'
import type { AxisSafeWriteProposalPort } from '../../src/main/services/axis-pivot-reviewed-continuation-ports'
import { recordAxisSafeWriteProposalUsage } from '../../src/shared/axis-run-state'
import {
  guardedTask,
  guardedSubmissionResult,
  retryAuthorization,
  reviewedProposalResult,
  selfRepairAuthorization,
} from '../fixtures/axis-pivot-guarded-continuation'

describe('AxisPivotReviewedContinuationOrchestrator', () => {
  it('derives the retry proposal target and submits the exact Main-issued review once', async () => {
    const propose = vi.fn(async () => reviewedProposalResult())
    const submit = vi.fn(async () => guardedSubmissionResult())
    const fixture = createOrchestrator({ propose, submit })

    const first = await fixture.orchestrator.orchestrate({ decisionId: 'decision-1' })
    const duplicate = await fixture.orchestrator.orchestrate({ decisionId: 'decision-1' })

    expect(first).toMatchObject({
      action: 'retry',
      continuationAttempt: { status: 'completed', submittedTaskId: 'task-1' },
      proposalResult: { proposal: { proposalId: 'proposal-1' } },
      status: 'completed',
    })
    expect(duplicate).toEqual(first)
    expect(propose).toHaveBeenCalledTimes(1)
    expect(propose).toHaveBeenCalledWith({
      expectedRevision: 4,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith({
      expectedRevision: 5,
      reviewedProposalReceipt: reviewedProposalResult().receipt,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    })
    fixture.close()
  })

  it('orchestrates a scheduled self-repair assignment through reviewed Guarded submission', async () => {
    const propose = vi.fn(async () => reviewedProposalResult())
    const submit = vi.fn(async () => guardedSubmissionResult())
    const fixture = createOrchestrator({
      authorization: selfRepairAuthorization(),
      propose,
      submit,
    })

    await expect(fixture.orchestrator.orchestrate({
      decisionId: 'decision-1',
    })).resolves.toMatchObject({
      action: 'self-repair',
      continuationAttempt: { action: 'self-repair', status: 'completed' },
      status: 'completed',
    })
    expect(propose).toHaveBeenCalledWith({
      expectedRevision: 4,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })
    expect(submit).toHaveBeenCalledTimes(1)
    fixture.close()
  })

  it('persists a real proposal-service stale-revision failure and never calls continuation', async () => {
    const proposal = reviewedProposalResult()
    const realProposalService = new AxisSafeWriteProposalService({
      files: { readAll: vi.fn() },
      model: { generate: vi.fn() },
      projects: { findBySession: vi.fn() },
      receipts: { capture: vi.fn(), issue: vi.fn() },
      runStates: {
        find: () => ({ ...proposal.runState, revision: 6 }),
        recordUsage: vi.fn(),
      },
      tasks: { findTask: vi.fn() },
    })
    const consume = vi.fn()
    const fixture = createOrchestrator({
      consume,
      propose: realProposalService.propose.bind(realProposalService),
    })

    await expect(fixture.orchestrator.orchestrate({
      decisionId: 'decision-1',
    })).rejects.toThrow(/revision conflict/i)
    await expect(fixture.orchestrator.orchestrate({
      decisionId: 'decision-1',
    })).rejects.toThrow(/already failed/i)
    expect(consume).not.toHaveBeenCalled()
    expect(fixture.orchestrations.findByDecision('decision-1')).toMatchObject({
      error: 'Axis run state revision conflict: expected 4, current 6',
      status: 'failed',
    })
    fixture.close()
  })

  it('rejects a proposal Port result that skips the authorized next revision', async () => {
    const valid = reviewedProposalResult()
    const skippedState = recordAxisSafeWriteProposalUsage(
      valid.runState,
      guardedTask.id,
      { costUsd: 0, tokens: 1 },
      1,
      '2026-07-30T00:00:06.000Z',
    )
    const consume = vi.fn()
    const fixture = createOrchestrator({
      consume,
      propose: async () => ({
        ...valid,
        proposal: { ...valid.proposal, expectedRevision: 6 },
        receipt: { ...valid.receipt, expectedRevision: 6 },
        runState: skippedState,
      }),
    })

    await expect(fixture.orchestrator.orchestrate({
      decisionId: 'decision-1',
    })).rejects.toThrow(/ownership/i)
    expect(consume).not.toHaveBeenCalled()
    expect(fixture.orchestrations.findByDecision('decision-1')).toMatchObject({
      status: 'failed',
    })
    fixture.close()
  })
})

function createOrchestrator(options: {
  authorization?: ReturnType<typeof retryAuthorization>
  consume?: ReturnType<typeof vi.fn>
  propose: AxisSafeWriteProposalPort['propose']
  submit?: ReturnType<typeof vi.fn>
}) {
  const authorization = {
    find: () => options.authorization ?? retryAuthorization(),
  }
  const continuationAttempts = new AxisPivotContinuationAttemptRegistry()
  const continuationConsumer = options.consume
    ? { consume: options.consume }
    : new AxisPivotGuardedContinuationConsumer({
        attempts: continuationAttempts,
        authorization,
        submissions: {
          submit: options.submit ?? vi.fn(async () => guardedSubmissionResult()),
        },
      })
  const orchestrations = new AxisPivotReviewedContinuationRegistry(':memory:', {
    clock: () => new Date('2026-08-02T00:00:00.000Z'),
    idFactory: () => 'reviewed-continuation-1',
  })
  return {
    close() {
      orchestrations.close()
      continuationAttempts.close()
    },
    orchestrations,
    orchestrator: new AxisPivotReviewedContinuationOrchestrator({
      authorization,
      continuations: continuationConsumer,
      orchestrations,
      proposals: { propose: options.propose },
    }),
  }
}
