import { describe, expect, it, vi } from 'vitest'
import { AxisGuardedSafeWriteSubmissionService } from '../../src/main/services/axis-guarded-safe-write-submission'
import type {
  AxisGuardedRunStatePort,
  AxisGuardedSafeWriteExecutionPort,
  AxisGuardedTaskReaderPort,
} from '../../src/main/services/axis-guarded-safe-write-ports'
import type { AxisProjectBindingReaderPort } from '../../src/main/services/axis-project-binding-ports'
import type {
  AxisReviewedProposalReceiptVerifierPort,
  AxisVerifiedReviewedProposal,
} from '../../src/main/services/axis-reviewed-proposal-ports'
import type { AxisTask } from '../../src/shared/axis-engine-contracts'
import {
  completeAxisGuardedTask,
  createAxisRunState,
  startAxisGuardedTask,
} from '../../src/shared/axis-run-state'
import { axisBudget } from '../fixtures/axis-shadow-run'

const task: AxisTask = {
  assignedFiles: ['src/one.ts'],
  dependencies: [],
  estimatedComplexity: 1,
  id: 'task-1',
  objective: 'Safely update one file',
  requiredTools: ['fs.safeWrite'],
  requiredGates: ['compile', 'test'],
  requiresHumanReview: false,
  spawnDepth: 1,
  title: 'Safe write',
}

const request = {
  expectedRevision: 1,
  reviewedProposalReceipt: reviewedReceipt(),
  runId: 'run-1',
  sessionId: 'session-1',
  taskId: 'task-1',
  writes: [{ content: 'after', filePath: 'src/one.ts' }],
}

describe('AxisGuardedSafeWriteSubmissionService', () => {
  it('claims explicit approval, executes with authoritative data, and projects a block into durable state', async () => {
    const execute = vi.fn(async () => blockedResult())
    const runStates = statePort()
    const service = createService({ execute, runStates })

    await expect(service.submit(request)).resolves.toMatchObject({
      execution: {
        blockReason: 'feature-disabled',
        status: 'blocked',
      },
      runState: {
        revision: 4,
        status: 'failed',
        tasks: [{ error: 'Axis real file execution is disabled', status: 'failed' }],
      },
    })
    expect(runStates.claimTask).toHaveBeenCalledWith({
      dependencyTaskIds: [],
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })
    expect(execute).toHaveBeenCalledWith({
      projectRoot: 'C:\\project',
      reviewedProposal: verifiedProposal(),
      runId: 'run-1',
      sessionId: 'session-1',
      task,
      writes: request.writes,
    })
    expect(runStates.finishTask).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 3,
      result: expect.objectContaining({
        findings: ['feature-disabled'],
        status: 'failed',
        taskId: 'task-1',
      }),
      runId: 'run-1',
      sessionId: 'session-1',
    }))
  })

  it('rejects stale approval before executing any write', async () => {
    const execute = vi.fn(async () => blockedResult())
    const runStates = statePort()
    vi.mocked(runStates.claimTask).mockImplementation(() => {
      throw new Error('Axis run state revision conflict: expected 1, current 3')
    })

    await expect(createService({ execute, runStates }).submit(request)).rejects.toThrow(/revision conflict/i)
    expect(execute).not.toHaveBeenCalled()
    expect(runStates.finishTask).not.toHaveBeenCalled()
  })

  it('fails closed before claiming for disabled execution, unknown ownership, unsafe tools, and write-set drift', async () => {
    const disabledStates = statePort()
    await expect(createService({
      execution: null,
      runStates: disabledStates,
    }).submit(request)).rejects.toThrow(/disabled/i)
    expect(disabledStates.claimTask).not.toHaveBeenCalled()

    await expect(createService({
      tasks: { findTask: () => null },
    }).submit(request)).rejects.toThrow(/task not found/i)
    await expect(createService({
      projects: { findBySession: () => null },
    }).submit(request)).rejects.toThrow(/project binding/i)
    await expect(createService({
      tasks: { findTask: () => ({ ...task, requiredTools: ['term.run'] }) },
    }).submit(request)).rejects.toThrow(/fs\.safeWrite/i)
    await expect(createService().submit({
      ...request,
      writes: [{ content: 'after', filePath: 'src/two.ts' }],
    })).rejects.toThrow(/assigned files/i)
  })

  it('strictly validates untrusted submissions before consulting Main Ports', async () => {
    const findTask = vi.fn(() => task)
    const runStates = statePort()
    const service = createService({ runStates, tasks: { findTask } })

    await expect(service.submit({
      ...request,
      projectRoot: 'C:\\forged',
    } as never)).rejects.toThrow()
    expect(findTask).not.toHaveBeenCalled()
    expect(runStates.claimTask).not.toHaveBeenCalled()
  })

  it('verifies the reviewed proposal and current baseline before claiming the task', async () => {
    const runStates = statePort()
    const reviewedProposals: AxisReviewedProposalReceiptVerifierPort = {
      verify: vi.fn(async () => {
        throw new Error('Axis reviewed proposal baseline changed before submission')
      }),
    }

    await expect(createService({
      reviewedProposals,
      runStates,
    }).submit(request)).rejects.toThrow(/baseline changed/i)
    expect(reviewedProposals.verify).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 1,
      receipt: request.reviewedProposalReceipt,
      writes: request.writes,
    }))
    expect(runStates.claimTask).not.toHaveBeenCalled()
    expect(runStates.finishTask).not.toHaveBeenCalled()
  })

  it('records an unexpected execution failure before surfacing the original error', async () => {
    const runStates = statePort()
    const service = createService({
      execute: async () => {
        throw new Error('worker crashed')
      },
      runStates,
    })

    await expect(service.submit(request)).rejects.toThrow('worker crashed')
    expect(runStates.finishTask).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 3,
      result: expect.objectContaining({
        findings: ['execution-error'],
        status: 'failed',
        summary: 'worker crashed',
      }),
    }))
  })

  it('surfaces terminal cleanup failure without retrying the durable finish', async () => {
    const runStates = statePort()
    vi.mocked(runStates.finishTask).mockImplementation(() => {
      throw new Error('lease cleanup failed')
    })

    await expect(createService({ runStates }).submit(request)).rejects.toThrow('lease cleanup failed')
    expect(runStates.finishTask).toHaveBeenCalledTimes(1)
  })
})

function createService(overrides: {
  execute?: AxisGuardedSafeWriteExecutionPort['execute']
  execution?: AxisGuardedSafeWriteExecutionPort | null
  projects?: AxisProjectBindingReaderPort
  reviewedProposals?: AxisReviewedProposalReceiptVerifierPort
  runStates?: AxisGuardedRunStatePort
  tasks?: AxisGuardedTaskReaderPort
} = {}): AxisGuardedSafeWriteSubmissionService {
  const execution = overrides.execution === undefined
    ? { execute: overrides.execute ?? (async () => blockedResult()) }
    : overrides.execution
  return new AxisGuardedSafeWriteSubmissionService({
    execution,
    projects: overrides.projects ?? {
      findBySession(sessionId) {
        return sessionId === 'session-1'
          ? {
              boundAt: '2026-07-29T00:00:00.000Z',
              projectId: 'project-1',
              projectRoot: 'C:\\project',
              schemaVersion: 1,
              sessionId,
            }
          : null
      },
    },
    reviewedProposals: overrides.reviewedProposals ?? {
      verify: vi.fn(async () => verifiedProposal()),
    },
    runStates: overrides.runStates ?? statePort(),
    tasks: overrides.tasks ?? {
      findTask(binding) {
        return binding.runId === 'run-1'
          && binding.sessionId === 'session-1'
          && binding.taskId === 'task-1'
          ? task
          : null
      },
    },
  })
}

function reviewedReceipt() {
  return {
    expectedRevision: 1,
    expiresAt: '2026-07-29T08:01:00.000Z',
    files: [{
      fileKey: '1'.repeat(64),
      filePath: 'src/one.ts',
      projectRelativePath: 'src/one.ts',
      proposedContentSha256: 'f39592393ef0859cb196a52693d2cea00fb2df784b3c04ae54aa7cadb8e562f8',
      state: {
        byteLength: 6,
        contentSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
        fileInstanceSha256: '2'.repeat(64),
        kind: 'exists' as const,
      },
    }],
    issuedAt: '2026-07-29T08:00:00.000Z',
    issuer: 'pivot-main' as const,
    projectId: 'project-1',
    proposalId: 'proposal-1',
    receiptId: 'reviewed-proposal-1',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    signature: '3'.repeat(64),
    taskId: 'task-1',
  }
}

function verifiedProposal(): AxisVerifiedReviewedProposal {
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
}

function statePort(): AxisGuardedRunStatePort {
  let state = createAxisRunState({
    complexity: {
      confidence: 1,
      policyAdjustments: [],
      reasons: ['One guarded write'],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      riskFlags: [],
      route: 'single-agent',
      schemaVersion: 1,
      score: 1,
      suggestedWorkers: 1,
    },
    dag: {
      createdAt: '2026-07-29T00:00:00.000Z',
      dagId: 'dag-1',
      objective: 'Safe write',
      schemaVersion: 1,
      tasks: [task],
    },
    mode: 'shadow',
    objective: 'Safe write',
    schedule: { batches: [['task-1']], orderedTaskIds: ['task-1'], warnings: [] },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{
        detail: 'planned',
        sequence: 1,
        taskId: null,
        timestamp: '2026-07-29T00:00:00.000Z',
        type: 'run-completed',
      }],
      runId: 'run-1',
      sessionId: 'session-1',
      startedAt: '2026-07-29T00:00:00.000Z',
      traceId: 'trace-1',
    },
    usage: {
      costUsd: 0,
      durationMs: 0,
      gateCyclesForFile: 0,
      pivots: 0,
      retriesForTask: 0,
      tokens: 0,
    },
  }, axisBudget(), '2026-07-29T00:00:00.000Z')
  return {
    claimTask: vi.fn((input) => {
      state = startAxisGuardedTask(
        state,
        input.taskId,
        input.dependencyTaskIds,
        '2026-07-29T00:00:01.000Z',
      )
      return state
    }),
    finishTask: vi.fn((input) => {
      state = completeAxisGuardedTask(
        state,
        input.result,
        '2026-07-29T00:00:02.000Z',
      )
      return state
    }),
  }
}

function blockedResult() {
  return {
    blockReason: 'feature-disabled' as const,
    checkpointReceipts: [],
    completionEvidence: null,
    detail: 'Axis real file execution is disabled',
    gateResult: null,
    mode: 'safe-write' as const,
    rollbackOutcomes: [],
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'blocked' as const,
    taskId: 'task-1',
    writeReceipts: [],
  }
}
