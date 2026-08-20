import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxisShadowRunResult } from '../../src/shared/axis-engine-contracts'
import { completeAxisDryRun, completeAxisGuardedTask, completeAxisTask, createAxisRunState, startAxisDryRun, startAxisGuardedTask, startAxisTask, transitionAxisRunState } from '../../src/shared/axis-run-state'
import { recordAxisSafeWriteProposalUsage } from '../../src/shared/axis-run-state'
import { axisBudget } from '../fixtures/axis-shadow-run'

const service = vi.hoisted(() => ({
  cancelRun: vi.fn(),
  dryRunState: vi.fn(),
  executeDryRun: vi.fn(),
  executeGuardedSafeWrite: vi.fn(),
  guardedSafeWriteState: vi.fn(),
  listRunStates: vi.fn(),
  listRuns: vi.fn(),
  plan: vi.fn(),
  proposeGuardedSafeWrite: vi.fn(),
  restartRun: vi.fn(),
  setEnabled: vi.fn(),
  setDryRunEnabled: vi.fn(),
  state: vi.fn(),
}))

vi.mock('../../src/renderer/services/axis-shadow.service', () => ({ axisShadowService: service }))

import { useAxisShadowStore } from '../../src/renderer/stores/axis-shadow.store'

beforeEach(() => {
  vi.resetAllMocks()
  service.dryRunState.mockResolvedValue({ enabled: false, reason: 'disabled' })
  service.guardedSafeWriteState.mockResolvedValue({ enabled: false, reason: 'disabled' })
  service.listRunStates.mockResolvedValue([])
  useAxisShadowStore.setState({
    activeRun: null,
    dryRunningRunId: null,
    dryRunState: null,
    error: null,
    isPlanning: false,
    guardedCompletionEvidence: null,
    guardedRunningTaskId: null,
    guardedProposal: null,
    guardedProposalReceipt: null,
    guardedProposingTaskId: null,
    guardedState: null,
    mutatingRunId: null,
    planningSessionId: null,
    runStates: [],
    runs: [],
    sessionId: null,
    state: null,
  })
})

describe('Axis Shadow renderer store', () => {
  it('loads the default-off state and only enables Shadow mode through an explicit action', async () => {
    service.state.mockResolvedValue({ available: false, enabled: false, reason: 'disabled' })
    service.setEnabled.mockResolvedValue({ available: true, enabled: true, reason: null })
    service.setDryRunEnabled.mockResolvedValue({ enabled: true, reason: null })

    await useAxisShadowStore.getState().loadState()
    expect(useAxisShadowStore.getState().state).toEqual({ available: false, enabled: false, reason: 'disabled' })
    expect(useAxisShadowStore.getState().dryRunState).toEqual({ enabled: false, reason: 'disabled' })
    expect(useAxisShadowStore.getState().guardedState).toEqual({ enabled: false, reason: 'disabled' })

    await useAxisShadowStore.getState().setShadowEnabled(true)
    expect(service.setEnabled).toHaveBeenCalledWith(true)
    expect(useAxisShadowStore.getState().state).toEqual({ available: true, enabled: true, reason: null })
    await useAxisShadowStore.getState().setDryRunEnabled(true)
    expect(service.setDryRunEnabled).toHaveBeenCalledWith(true)
    expect(useAxisShadowStore.getState().dryRunState).toEqual({ enabled: true, reason: null })
  })

  it('ignores a stale history response after the active session changes', async () => {
    const first = deferred<AxisShadowRunResult[]>()
    service.listRuns.mockImplementation((sessionId: string) => sessionId === 'session-a' ? first.promise : Promise.resolve([run('run-b', 'session-b')]))

    const loadingA = useAxisShadowStore.getState().loadRuns('session-a')
    await useAxisShadowStore.getState().loadRuns('session-b')
    first.resolve([run('run-a', 'session-a')])
    await loadingA

    expect(useAxisShadowStore.getState().sessionId).toBe('session-b')
    expect(useAxisShadowStore.getState().runs.map((item) => item.trace.runId)).toEqual(['run-b'])
  })

  it('stores a completed plan only while its requested session remains active', async () => {
    service.listRuns.mockResolvedValue([])
    service.plan.mockResolvedValue(run('run-a', 'session-a'))
    await useAxisShadowStore.getState().loadRuns('session-a')

    await useAxisShadowStore.getState().plan('session-a', 'Build Axis')

    expect(service.plan).toHaveBeenCalledWith('session-a', 'Build Axis')
    expect(useAxisShadowStore.getState().activeRun?.trace.runId).toBe('run-a')
    expect(useAxisShadowStore.getState().isPlanning).toBe(false)
  })

  it('sends the current revision when cancelling and reopening a durable plan', async () => {
    const plan = run('run-a', 'session-a')
    const initial = createAxisRunState(plan, axisBudget(), '2026-07-22T01:00:00.000Z')
    const cancelled = transitionAxisRunState(initial, 'cancel', '2026-07-22T01:01:00.000Z')
    const reopened = transitionAxisRunState(cancelled, 'restart', '2026-07-22T01:02:00.000Z')
    service.listRuns.mockResolvedValue([plan])
    service.listRunStates.mockResolvedValue([initial])
    service.cancelRun.mockResolvedValue(cancelled)
    service.restartRun.mockResolvedValue(reopened)
    await useAxisShadowStore.getState().loadRuns('session-a')

    await useAxisShadowStore.getState().cancelRun('run-a')
    expect(service.cancelRun).toHaveBeenCalledWith({ expectedRevision: 1, runId: 'run-a', sessionId: 'session-a' })
    expect(useAxisShadowStore.getState().runStates[0]).toMatchObject({ revision: 2, status: 'cancelled' })

    await useAxisShadowStore.getState().restartRun('run-a')
    expect(service.restartRun).toHaveBeenCalledWith({ expectedRevision: 2, runId: 'run-a', sessionId: 'session-a' })
    expect(useAxisShadowStore.getState().runStates[0]).toMatchObject({ revision: 3, status: 'planned' })
  })

  it('submits exact task approval and stores the terminal dry-run state', async () => {
    const plan = run('run-a', 'session-a')
    const initial = createAxisRunState(plan, axisBudget(), '2026-07-22T02:00:00.000Z')
    const running = startAxisDryRun(initial, ['inspect'], '2026-07-22T02:00:01.000Z')
    const taskRunning = startAxisTask(running, 'inspect', '2026-07-22T02:00:02.000Z')
    const taskCompleted = completeAxisTask(taskRunning, {
      artifacts: [], findings: [], status: 'completed', summary: 'Simulated', taskId: 'inspect',
      usage: { costUsd: 0, durationMs: 0, tokens: 0 },
    }, '2026-07-22T02:00:03.000Z')
    const completed = completeAxisDryRun(taskCompleted, '2026-07-22T02:00:04.000Z')
    service.listRuns.mockResolvedValue([plan])
    service.listRunStates.mockResolvedValue([initial])
    service.executeDryRun.mockResolvedValue(completed)
    await useAxisShadowStore.getState().loadRuns('session-a')
    useAxisShadowStore.setState({ dryRunState: { enabled: true, reason: null } })

    await useAxisShadowStore.getState().executeDryRun('run-a')

    expect(service.executeDryRun).toHaveBeenCalledWith({
      approvedTaskIds: ['inspect'], expectedRevision: 1, runId: 'run-a', sessionId: 'session-a',
    })
    expect(useAxisShadowStore.getState().runStates[0]).toMatchObject({ revision: 5, status: 'completed' })
    expect(useAxisShadowStore.getState().dryRunningRunId).toBeNull()
  })

  it('submits a guarded write with the current revision and stores its authoritative terminal state', async () => {
    const plan = guardedRun('run-a', 'session-a')
    const initial = createAxisRunState(plan, axisBudget(), '2026-07-22T03:00:00.000Z')
    const claimed = startAxisGuardedTask(initial, 'write', [], '2026-07-22T03:00:01.000Z')
    const failed = completeAxisGuardedTask(claimed, {
      artifacts: [],
      findings: ['permission-denied'],
      status: 'failed',
      summary: 'Permission denied',
      taskId: 'write',
      usage: { costUsd: 0, durationMs: 1, tokens: 0 },
    }, '2026-07-22T03:00:02.000Z')
    service.listRuns.mockResolvedValue([plan])
    service.listRunStates.mockResolvedValue([initial])
    service.executeGuardedSafeWrite.mockResolvedValue({
      execution: {
        blockReason: 'permission-denied',
        checkpointReceipts: [],
        completionEvidence: null,
        detail: 'Permission denied',
        gateResult: null,
        mode: 'safe-write',
        rollbackOutcomes: [],
        runId: 'run-a',
        sessionId: 'session-a',
        status: 'blocked',
        taskId: 'write',
        writeReceipts: [],
      },
      runState: failed,
    })
    await useAxisShadowStore.getState().loadRuns('session-a')
    const receipt = reviewedReceipt('run-a', 'session-a', 1)
    useAxisShadowStore.setState({ guardedProposalReceipt: receipt })

    await useAxisShadowStore.getState().executeGuardedSafeWrite(
      'run-a',
      'write',
      [{ content: 'after', filePath: 'src/one.ts' }],
    )

    expect(service.executeGuardedSafeWrite).toHaveBeenCalledWith({
      expectedRevision: 1,
      reviewedProposalReceipt: receipt,
      runId: 'run-a',
      sessionId: 'session-a',
      taskId: 'write',
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    })
    expect(useAxisShadowStore.getState().runStates[0]).toMatchObject({
      revision: 4,
      status: 'failed',
    })
    expect(useAxisShadowStore.getState().guardedRunningTaskId).toBeNull()
    expect(useAxisShadowStore.getState().guardedCompletionEvidence).toBeNull()
  })

  it('stores only the Main-issued durable completion evidence from a successful guarded write', async () => {
    const plan = guardedRun('run-a', 'session-a')
    const initial = createAxisRunState(plan, axisBudget(), '2026-07-22T03:00:00.000Z')
    const claimed = startAxisGuardedTask(initial, 'write', [], '2026-07-22T03:00:01.000Z')
    const completed = completeAxisGuardedTask(claimed, {
      artifacts: [{ id: 'envelope-1', path: 'src/one.ts', type: 'file' }],
      findings: [],
      status: 'completed',
      summary: 'Completed',
      taskId: 'write',
      usage: { costUsd: 0, durationMs: 1, tokens: 0 },
    }, '2026-07-22T03:00:04.000Z')
    const checkpointReceipt = {
      checkpointId: 'checkpoint-1',
      filePath: 'src/one.ts',
      priorState: 'existing-file' as const,
      rollbackAction: 'restore-checkpoint' as const,
    }
    const completionEvidence = {
      authority: 'pivot-main' as const,
      checkpointReceipts: [checkpointReceipt],
      completedAt: '2026-07-22T03:00:03.000Z',
      gateEvidenceIds: ['gate-evidence-1'],
      runId: 'run-a',
      schemaVersion: 1 as const,
      sessionId: 'session-a',
      status: 'completed' as const,
      taskId: 'write',
      transactionId: 'transaction-1',
      transactionRevision: 3,
      writes: [{
        contentSha256: '1'.repeat(64),
        envelopeId: 'envelope-1',
        filePath: 'src/one.ts',
      }],
    }
    service.listRuns.mockResolvedValue([plan])
    service.listRunStates.mockResolvedValue([initial])
    service.executeGuardedSafeWrite.mockResolvedValue({
      execution: {
        blockReason: null,
        checkpointReceipts: [checkpointReceipt],
        completionEvidence,
        detail: 'Completed',
        gateResult: {
          cycle: 1,
          evidenceIds: ['gate-evidence-1'],
          gates: [{
            durationMs: 1,
            evidence: ['compile passed'],
            gate: 'compile',
            status: 'passed',
            taskId: 'write',
          }],
          runId: 'run-a',
          schemaVersion: 1,
          sessionId: 'session-a',
          status: 'passed',
          taskId: 'write',
        },
        mode: 'safe-write',
        rollbackOutcomes: [],
        runId: 'run-a',
        sessionId: 'session-a',
        status: 'completed',
        taskId: 'write',
        writeReceipts: [{
          checkpointReceipt,
          contentSha256: '1'.repeat(64),
          envelopeId: 'envelope-1',
          filePath: 'src/one.ts',
          mode: 'safe-write',
          rollbackOwner: {
            kind: 'axis-run',
            runId: 'run-a',
            sessionId: 'session-a',
          },
          runId: 'run-a',
          sessionId: 'session-a',
          sizeBytes: 5,
          status: 'written',
          taskId: 'write',
          timestamp: '2026-07-22T03:00:02.000Z',
          toolName: 'fs.safeWrite',
        }],
      },
      runState: completed,
    })
    await useAxisShadowStore.getState().loadRuns('session-a')
    useAxisShadowStore.setState({
      guardedProposalReceipt: reviewedReceipt('run-a', 'session-a', 1),
    })

    await useAxisShadowStore.getState().executeGuardedSafeWrite(
      'run-a',
      'write',
      [{ content: 'after', filePath: 'src/one.ts' }],
    )

    expect(useAxisShadowStore.getState().guardedCompletionEvidence).toEqual(completionEvidence)
    expect(useAxisShadowStore.getState().runStates[0]).toMatchObject({
      status: 'completed',
    })
  })

  it('requests a review-only model proposal at the current revision', async () => {
    const plan = guardedRun('run-a', 'session-a')
    const initial = createAxisRunState(plan, axisBudget(), '2026-07-22T03:00:00.000Z')
    service.listRuns.mockResolvedValue([plan])
    service.listRunStates.mockResolvedValue([initial])
    const accounted = recordAxisSafeWriteProposalUsage(
      initial,
      'write',
      { costUsd: 0.001, tokens: 100 },
      5,
      '2026-07-29T08:00:00.000Z',
    )
    service.proposeGuardedSafeWrite.mockResolvedValue({
      proposal: {
      createdAt: '2026-07-29T08:00:00.000Z',
      expectedRevision: 2,
      files: [{
        filePath: 'src/one.ts',
        originalContent: 'before',
        originalSha256: '1'.repeat(64),
        originalState: 'existing',
        proposedContent: 'after',
      }],
      proposalId: 'proposal-1',
      runId: 'run-a',
      sessionId: 'session-a',
      taskId: 'write',
      usage: { costUsd: 0.001, tokens: 100 },
      },
      receipt: reviewedReceipt('run-a', 'session-a', 2),
      runState: accounted,
    })
    await useAxisShadowStore.getState().loadRuns('session-a')
    useAxisShadowStore.setState({
      guardedState: { enabled: true, reason: null },
    })

    await useAxisShadowStore.getState().proposeGuardedSafeWrite('run-a', 'write')

    expect(service.proposeGuardedSafeWrite).toHaveBeenCalledWith({
      expectedRevision: 1,
      runId: 'run-a',
      sessionId: 'session-a',
      taskId: 'write',
    })
    expect(useAxisShadowStore.getState().guardedProposal).toMatchObject({
      proposalId: 'proposal-1',
      taskId: 'write',
    })
    expect(useAxisShadowStore.getState().guardedProposalReceipt).toMatchObject({
      expectedRevision: 2,
      proposalId: 'proposal-1',
    })
    expect(useAxisShadowStore.getState().runStates[0]?.revision).toBe(2)
    expect(useAxisShadowStore.getState().guardedProposingTaskId).toBeNull()
  })
})

function reviewedReceipt(runId: string, sessionId: string, expectedRevision: number) {
  return {
    expectedRevision,
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
    runId,
    schemaVersion: 1 as const,
    sessionId,
    signature: '3'.repeat(64),
    taskId: 'write',
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

function run(runId: string, sessionId: string): AxisShadowRunResult {
  const startedAt = '2026-07-22T00:00:00.000Z'
  return {
    complexity: { confidence: 1, policyAdjustments: [], reasons: ['Simple'], requiredGates: ['compile', 'test'], requiresHumanReview: false, riskFlags: [], route: 'single-agent', schemaVersion: 1, score: 1, suggestedWorkers: 1 },
    dag: {
      createdAt: startedAt,
      dagId: `dag-${runId}`,
      objective: 'Build Axis',
      schemaVersion: 1,
      tasks: [{ assignedFiles: [], dependencies: [], estimatedComplexity: 1, id: 'inspect', objective: 'Inspect', requiredGates: ['compile', 'test'], requiresHumanReview: false, requiredTools: ['read'], spawnDepth: 1, title: 'Inspect' }],
    },
    mode: 'shadow',
    objective: 'Build Axis',
    schedule: { batches: [['inspect']], orderedTaskIds: ['inspect'], warnings: [] },
    status: 'planned',
    stopReason: null,
    trace: {
      events: [{ detail: 'done', sequence: 1, taskId: null, timestamp: startedAt, type: 'run-completed' }],
      runId,
      sessionId,
      startedAt,
      traceId: `trace-${runId}`,
    },
    usage: { costUsd: 0.01, durationMs: 100, gateCyclesForFile: 0, pivots: 0, retriesForTask: 0, tokens: 100 },
  }
}

function guardedRun(runId: string, sessionId: string): AxisShadowRunResult {
  const result = run(runId, sessionId)
  result.dag!.tasks = [{
    assignedFiles: ['src/one.ts'],
    dependencies: [],
    estimatedComplexity: 1,
    id: 'write',
    objective: 'Write',
    requiredTools: ['fs.safeWrite'],
    requiredGates: ['compile', 'test'],
    requiresHumanReview: false,
    spawnDepth: 1,
    title: 'Write',
  }]
  result.schedule = {
    batches: [['write']],
    orderedTaskIds: ['write'],
    warnings: [],
  }
  return result
}
