import { describe, expect, it, vi } from 'vitest'
import { AxisGuardedSafeWriteSubmissionService } from '../../src/main/services/axis-guarded-safe-write-submission'
import { AxisPivotContinuationAttemptRegistry } from '../../src/main/services/axis-pivot-continuation-attempt-registry'
import { AxisPivotGuardedContinuationConsumer } from '../../src/main/services/axis-pivot-guarded-continuation-consumer'
import type {
  AxisGuardedSafeWriteSubmissionPort,
  AxisPivotContinuationAuthorizationPort,
} from '../../src/main/services/axis-pivot-guarded-continuation-ports'
import {
  guardedTask,
  guardedContinuationRequest,
  guardedSubmissionResult,
  dedicatedFixerAuthorization,
  reviewedReceipt,
  retryAuthorization,
  selfRepairAuthorization,
} from '../fixtures/axis-pivot-guarded-continuation'

describe('AxisPivotGuardedContinuationConsumer', () => {
  it('submits an explicit reviewed retry once and reuses durable completion', async () => {
    const submit = vi.fn(async () => guardedSubmissionResult())
    const fixture = consumer({ submit })

    const first = await fixture.consumer.consume(guardedContinuationRequest())
    const duplicate = await fixture.consumer.consume(guardedContinuationRequest())

    expect(first).toMatchObject({
      action: 'retry',
      proposalId: 'proposal-1',
      reviewedProposalReceiptId: 'reviewed-proposal-1',
      status: 'completed',
      submittedTaskId: 'task-1',
    })
    expect(duplicate).toEqual(first)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(guardedContinuationRequest().submission)
    fixture.registry.close()
  })

  it('accepts only scheduled assignment actions and rejects legacy assignment-only evidence', async () => {
    const submit = vi.fn(async () => guardedSubmissionResult())
    const fixture = consumer({ submit })

    await expect(fixture.consumer.consume({
      ...guardedContinuationRequest(),
      handoffId: 'forged-handoff',
    })).rejects.toThrow(/handoff/i)
    await expect(fixture.consumer.consume(guardedContinuationRequest({
      taskId: 'other-task',
    }))).rejects.toThrow(/task/i)

    const selfRepair = consumer({
      authorization: selfRepairAuthorization(),
      submit,
    })
    await expect(selfRepair.consumer.consume(
      guardedContinuationRequest(),
    )).resolves.toMatchObject({ action: 'self-repair', status: 'completed' })

    const dedicatedFixer = consumer({
      authorization: dedicatedFixerAuthorization(),
      submit,
    })
    await expect(dedicatedFixer.consumer.consume(
      guardedContinuationRequest(),
    )).resolves.toMatchObject({ action: 'dedicated-fixer', status: 'completed' })

    const assignmentOnly = consumer({
      authorization: selfRepairAuthorization({ scheduled: false }),
      submit,
    })
    await expect(assignmentOnly.consumer.consume(
      guardedContinuationRequest(),
    )).rejects.toThrow(/scheduling/i)
    expect(submit).toHaveBeenCalledTimes(2)
    fixture.registry.close()
    selfRepair.registry.close()
    dedicatedFixer.registry.close()
    assignmentOnly.registry.close()
  })

  it('persists a real Guarded submission failure and never replays the same reviewed request', async () => {
    const execute = vi.fn(async () => guardedSubmissionResult().execution)
    const guarded = new AxisGuardedSafeWriteSubmissionService({
      execution: { execute },
      projects: {
        findBySession: (sessionId) => sessionId === 'session-1'
          ? {
              boundAt: '2026-07-30T00:00:00.000Z',
              projectId: 'project-1',
              projectRoot: 'C:\\project',
              schemaVersion: 1,
              sessionId,
            }
          : null,
      },
      reviewedProposals: {
        verify: async () => {
          const receipt = reviewedReceipt()
          return {
            expectedRevision: receipt.expectedRevision,
            expiresAt: receipt.expiresAt,
            files: receipt.files,
            projectId: receipt.projectId,
            proposalId: receipt.proposalId,
            receiptId: receipt.receiptId,
            runId: receipt.runId,
            sessionId: receipt.sessionId,
            taskId: receipt.taskId,
            verified: true,
          }
        },
      },
      runStates: {
        claimTask: () => {
          throw new Error('Axis run state revision conflict: expected 5, current 6')
        },
        finishTask: vi.fn(),
      },
      tasks: {
        findTask: (binding) => binding.runId === 'run-1'
          && binding.sessionId === 'session-1'
          && binding.taskId === 'task-1'
          ? guardedTask
          : null,
      },
    })
    const submit = vi.fn(guarded.submit.bind(guarded))
    const fixture = consumer({ submit })

    await expect(fixture.consumer.consume(
      guardedContinuationRequest(),
    )).rejects.toThrow(/revision conflict/i)
    await expect(fixture.consumer.consume(
      guardedContinuationRequest(),
    )).rejects.toThrow(/already failed/i)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(fixture.registry.listForHandoff('continuation-1')).toEqual([
      expect.objectContaining({
        error: 'Axis run state revision conflict: expected 5, current 6',
        status: 'failed',
      }),
    ])
    fixture.registry.close()
  })
})

function consumer(options: {
  authorization?: ReturnType<typeof retryAuthorization>
  submit: AxisGuardedSafeWriteSubmissionPort['submit']
}) {
  const registry = new AxisPivotContinuationAttemptRegistry(':memory:', {
    clock: () => new Date('2026-07-30T00:00:01.000Z'),
    idFactory: () => 'attempt-1',
  })
  const authorization: AxisPivotContinuationAuthorizationPort = {
    find: () => options.authorization ?? retryAuthorization(),
  }
  const submissions: AxisGuardedSafeWriteSubmissionPort = {
    submit: options.submit,
  }
  return {
    consumer: new AxisPivotGuardedContinuationConsumer({
      attempts: registry,
      authorization,
      submissions,
    }),
    registry,
  }
}
