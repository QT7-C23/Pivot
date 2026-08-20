import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPCContract } from '../../src/shared/types/ipc'
import type { AxisShadowRunResult } from '../../src/shared/axis-engine-contracts'
import { AxisPivotContinuationRegistry } from '../../src/main/services/axis-pivot-continuation-registry'
import { AxisPivotFailureEvidenceRegistry } from '../../src/main/services/axis-pivot-failure-evidence-registry'
import { AxisPivotReviewedContinuationRegistry } from '../../src/main/services/axis-pivot-reviewed-continuation-registry'
import { AxisPivotReplanReviewedTaskRegistry } from '../../src/main/services/axis-pivot-replan-reviewed-task-registry'
import { AxisPivotReplanRunDriveRegistry } from '../../src/main/services/axis-pivot-replan-run-drive-registry'
import { AxisPivotReplanTaskScheduleRegistry } from '../../src/main/services/axis-pivot-replan-task-schedule-registry'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { AxisSettingsStore } from '../../src/main/services/axis-settings-store'
import { AxisShadowRunRegistry } from '../../src/main/services/axis-shadow-run-registry'
import { ProviderStore } from '../../src/main/services/provider-store'
import { SessionRegistry } from '../../src/main/services/session-registry'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
  permissionDecision: null as 'allow' | 'deny' | null,
  trustedUrl: 'https://pivot.test/index.html',
}))
const ai = vi.hoisted(() => ({ generateText: vi.fn() }))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: () => null,
    getAllWindows: () => electron.permissionDecision
      ? [{
          webContents: {
            send(signal: string, payload: unknown) {
              if (
                signal === 'permission:request'
                && payload
                && typeof payload === 'object'
                && 'requestId' in payload
              ) {
                const behavior = electron.permissionDecision!
                const requestId = String(payload.requestId)
                queueMicrotask(() => {
                  void invoke('chat:permission', { behavior, requestId })
                })
              }
            },
          },
        }]
      : [],
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
  ipcMain: {
    handle(channel: string, handler: (event: unknown, request: unknown) => unknown) {
      electron.handlers.set(channel, handler)
    },
  },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    isEncryptionAvailable: () => true,
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
    showItemInFolder: vi.fn(),
  },
}))

vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('ai')>(),
  generateText: ai.generateText,
}))

import { registerIpcHandlers } from '../../src/main/ipc-handlers'

let originalPivotFeature: string | undefined
let originalRealExecutionFeature: string | undefined

beforeEach(() => {
  electron.handlers.clear()
  electron.permissionDecision = null
  ai.generateText.mockReset()
  ai.generateText.mockResolvedValue({
    output: {
      action: 'self-repair',
      reason: 'Repair the failed dry-run attempt',
      taskId: 'inspect',
    },
    usage: { inputTokens: 10, outputTokens: 5 },
  })
  originalPivotFeature = process.env['PIVOT_AXIS_DYNAMIC_PIVOT']
  originalRealExecutionFeature = process.env['PIVOT_AXIS_REAL_EXECUTION']
  process.env['PIVOT_AXIS_DYNAMIC_PIVOT'] = '1'
  process.env['PIVOT_AXIS_REAL_EXECUTION'] = '0'
})

afterEach(() => {
  if (originalPivotFeature === undefined) {
    delete process.env['PIVOT_AXIS_DYNAMIC_PIVOT']
  } else {
    process.env['PIVOT_AXIS_DYNAMIC_PIVOT'] = originalPivotFeature
  }
  if (originalRealExecutionFeature === undefined) {
    delete process.env['PIVOT_AXIS_REAL_EXECUTION']
  } else {
    process.env['PIVOT_AXIS_REAL_EXECUTION'] = originalRealExecutionFeature
  }
})

describe('Axis Pivot failure Main IPC system boundary', () => {
  it('tracks a real Dry-run failure and persists a pending self-repair schedule when Guarded execution is disabled', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pivot-failure-ipc-'))
    const databasePath = path.join(root, 'pivot.db')
    const projectRoot = path.join(root, 'project')
    await mkdir(projectRoot)
    let resources: ReturnType<typeof registerIpcHandlers> | null = null
    try {
      const sessionId = seed(databasePath, projectRoot)
      resources = registerIpcHandlers({
        axisPivot: {
          dryRunExecutor: {
            async execute({ task }) {
              return {
                artifacts: [],
                findings: ['Injected authoritative Dry-run failure'],
                status: 'failed',
                summary: 'Dry-run Worker failed',
                taskId: task.id,
                usage: { costUsd: 0, durationMs: 1, tokens: 0 },
              }
            },
          },
        },
        databasePath,
        trustedRendererUrl: electron.trustedUrl,
      })
      await resources.ready

      const state = await invoke('axis:execute-dry-run', {
        approvedTaskIds: ['inspect'],
        expectedRevision: 1,
        runId: 'run-1',
        sessionId,
      })

      expect(state).toMatchObject({
        status: 'running',
        tasks: [{ status: 'pending', taskId: 'inspect' }],
      })
      const decisionId = state.events.find(
        (event) => event.type === 'pivot-decided',
      )?.pivotDecisionId
      expect(state.events.at(-1)).toMatchObject({
        pivotDecisionId: decisionId,
        taskId: 'inspect',
        type: 'pivot-self-repair-scheduled',
      })
      expect(decisionId).toEqual(expect.any(String))
      expect(ai.generateText).toHaveBeenCalledOnce()

      const evidence = new AxisPivotFailureEvidenceRegistry(databasePath)
      const continuations = new AxisPivotContinuationRegistry(databasePath)
      expect(evidence.findBySource('run-1', state.revision - 2)).toMatchObject({
        summary: 'Dry-run Worker failed',
        taskId: 'inspect',
      })
      expect(continuations.findByDecision(decisionId!)).toMatchObject({
        action: 'self-repair',
        status: 'pending-guarded-review',
      })
      continuations.close()
      evidence.close()
    } finally {
      resources?.close()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('orchestrates a real registered retry through proposal, permission and Guarded completion', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pivot-reviewed-retry-ipc-'))
    const databasePath = path.join(root, 'pivot.db')
    const projectRoot = path.join(root, 'project')
    const filePath = path.join(projectRoot, 'src', 'one.ts')
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, 'before')
    let resources: ReturnType<typeof registerIpcHandlers> | null = null
    try {
      process.env['PIVOT_AXIS_REAL_EXECUTION'] = '1'
      electron.permissionDecision = 'allow'
      ai.generateText
        .mockResolvedValueOnce({
          output: {
            action: 'retry',
            reason: 'Retry the failed guarded write',
            taskId: 'task-1',
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            writes: [{ content: 'after', filePath }],
          },
          usage: { inputTokens: 20, outputTokens: 5 },
        })
      const sessionId = seedGuardedRetry(databasePath, projectRoot, filePath)
      resources = registerIpcHandlers({
        axisGuarded: {
          gateCommandRunner: {
            async run(request) {
              return {
                ...request,
                exitCode: 0,
                finishedAt: '2026-08-02T00:00:02.000Z',
                outputTruncated: false,
                startedAt: '2026-08-02T00:00:01.000Z',
                stderr: '',
                stdout: 'passed',
                timedOut: false,
              }
            },
          },
        },
        axisPivot: {
          dryRunExecutor: {
            async execute({ task }) {
              return {
                artifacts: [],
                findings: ['Injected guarded retry failure'],
                status: 'failed',
                summary: 'Guarded retry source failed',
                taskId: task.id,
                usage: { costUsd: 0, durationMs: 1, tokens: 0 },
              }
            },
          },
        },
        databasePath,
        trustedRendererUrl: electron.trustedUrl,
      })
      await resources.ready

      const state = await invoke('axis:execute-dry-run', {
        approvedTaskIds: ['task-1'],
        expectedRevision: 1,
        runId: 'run-1',
        sessionId,
      })

      expect(state).toMatchObject({
        status: 'completed',
        tasks: [{ status: 'completed', taskId: 'task-1' }],
      })
      expect(await readFile(filePath, 'utf8')).toBe('after')
      expect(ai.generateText).toHaveBeenCalledTimes(2)
      const decisionId = state.events.find(
        (event) => event.type === 'pivot-decided',
      )?.pivotDecisionId
      expect(decisionId).toEqual(expect.any(String))
      const orchestrations = new AxisPivotReviewedContinuationRegistry(databasePath)
      expect(orchestrations.findByDecision(decisionId!)).toMatchObject({
        continuationAttempt: {
          guardedResult: { execution: { status: 'completed' } },
          status: 'completed',
        },
        status: 'completed',
      })
      orchestrations.close()
    } finally {
      resources?.close()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('orchestrates a real registered self-repair assignment through Guarded completion', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pivot-reviewed-self-repair-ipc-'))
    const databasePath = path.join(root, 'pivot.db')
    const projectRoot = path.join(root, 'project')
    const filePath = path.join(projectRoot, 'src', 'one.ts')
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, 'before')
    let resources: ReturnType<typeof registerIpcHandlers> | null = null
    try {
      process.env['PIVOT_AXIS_REAL_EXECUTION'] = '1'
      electron.permissionDecision = 'allow'
      ai.generateText
        .mockResolvedValueOnce({
          output: {
            action: 'self-repair',
            reason: 'Repair the failed task with the same Worker',
            taskId: 'task-1',
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            writes: [{ content: 'self-repaired', filePath }],
          },
          usage: { inputTokens: 20, outputTokens: 5 },
        })
      const sessionId = seedGuardedRetry(databasePath, projectRoot, filePath)
      resources = registerIpcHandlers({
        axisGuarded: {
          gateCommandRunner: {
            async run(request) {
              return {
                ...request,
                exitCode: 0,
                finishedAt: '2026-08-02T00:10:02.000Z',
                outputTruncated: false,
                startedAt: '2026-08-02T00:10:01.000Z',
                stderr: '',
                stdout: 'passed',
                timedOut: false,
              }
            },
          },
        },
        axisPivot: {
          dryRunExecutor: {
            async execute({ task }) {
              return {
                artifacts: [],
                findings: ['Injected self-repair failure'],
                status: 'failed',
                summary: 'Self-repair source failed',
                taskId: task.id,
                usage: { costUsd: 0, durationMs: 1, tokens: 0 },
              }
            },
          },
        },
        databasePath,
        trustedRendererUrl: electron.trustedUrl,
      })
      await resources.ready

      const state = await invoke('axis:execute-dry-run', {
        approvedTaskIds: ['task-1'],
        expectedRevision: 1,
        runId: 'run-1',
        sessionId,
      })

      expect(state).toMatchObject({
        status: 'completed',
        tasks: [{ status: 'completed', taskId: 'task-1' }],
      })
      expect(state.events).toContainEqual(expect.objectContaining({
        taskId: 'task-1',
        type: 'pivot-self-repair-scheduled',
      }))
      expect(await readFile(filePath, 'utf8')).toBe('self-repaired')
      const decisionId = state.events.find(
        (event) => event.type === 'pivot-decided',
      )?.pivotDecisionId
      const orchestrations = new AxisPivotReviewedContinuationRegistry(databasePath)
      expect(orchestrations.findByDecision(decisionId!)).toMatchObject({
        action: 'self-repair',
        continuationAttempt: {
          action: 'self-repair',
          guardedResult: { execution: { status: 'completed' } },
          status: 'completed',
        },
        status: 'completed',
      })
      orchestrations.close()
    } finally {
      resources?.close()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('observes a failed guarded retry as direction, replans, and persists the child schedule', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pivot-retry-replan-ipc-'))
    const databasePath = path.join(root, 'pivot.db')
    const projectRoot = path.join(root, 'project')
    const filePath = path.join(projectRoot, 'src', 'one.ts')
    const secondFilePath = path.join(projectRoot, 'src', 'two.ts')
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, 'before')
    await writeFile(secondFilePath, 'before-two')
    let resources: ReturnType<typeof registerIpcHandlers> | null = null
    try {
      process.env['PIVOT_AXIS_REAL_EXECUTION'] = '1'
      electron.permissionDecision = 'allow'
      ai.generateText
        .mockResolvedValueOnce({
          output: {
            action: 'retry',
            reason: 'Retry the initial narrow failure',
            taskId: 'task-1',
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            writes: [{ content: 'after', filePath }],
          },
          usage: { inputTokens: 20, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            action: 'replan',
            reason: 'Change direction after the guarded retry failed',
            taskId: 'task-1',
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            confidence: 0.9,
            reasons: ['The retry failed its authoritative Gate'],
            riskFlags: [],
            route: 'multi-agent',
            score: 2,
            suggestedWorkers: 2,
          },
          usage: { inputTokens: 10, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            createdAt: '2026-08-02T01:10:00.000Z',
            dagId: 'dag-replanned-1',
            objective: 'Build Axis state',
            schemaVersion: 1,
            tasks: [{
              assignedFiles: ['src/one.ts'],
              dependencies: [],
              estimatedComplexity: 2,
              id: 'child-task-1',
              objective: 'Repair the failed guarded write with a new plan',
              requiredTools: ['fs.safeWrite'],
              spawnDepth: 1,
              title: 'Replanned safe write',
            }, {
              assignedFiles: ['src/two.ts'],
              dependencies: ['child-task-1'],
              estimatedComplexity: 2,
              id: 'child-task-2',
              objective: 'Complete the dependent repair',
              requiredTools: ['fs.safeWrite'],
              spawnDepth: 1,
              title: 'Dependent replanned safe write',
            }],
          },
          usage: { inputTokens: 20, outputTokens: 10 },
        })
        .mockResolvedValueOnce({
          output: {
            writes: [{ content: 'replanned', filePath: 'src/one.ts' }],
          },
          usage: { inputTokens: 20, outputTokens: 5 },
        })
        .mockResolvedValueOnce({
          output: {
            writes: [{ content: 'replanned-two', filePath: 'src/two.ts' }],
          },
          usage: { inputTokens: 20, outputTokens: 5 },
        })
      const sessionId = seedGuardedRetry(databasePath, projectRoot, filePath)
      let gateRuns = 0
      resources = registerIpcHandlers({
        axisGuarded: {
          gateCommandRunner: {
            async run(request) {
              gateRuns += 1
              return {
                ...request,
                exitCode: gateRuns === 1 ? 1 : 0,
                finishedAt: '2026-08-02T01:09:02.000Z',
                outputTruncated: false,
                startedAt: '2026-08-02T01:09:01.000Z',
                stderr: gateRuns === 1 ? 'compile failed' : '',
                stdout: gateRuns === 1 ? '' : 'passed',
                timedOut: false,
              }
            },
          },
        },
        axisPivot: {
          dryRunExecutor: {
            async execute({ task }) {
              return {
                artifacts: [],
                findings: ['Injected initial failure'],
                status: 'failed',
                summary: 'Initial dry-run task failed',
                taskId: task.id,
                usage: { costUsd: 0, durationMs: 1, tokens: 0 },
              }
            },
          },
        },
        databasePath,
        trustedRendererUrl: electron.trustedUrl,
      })
      await resources.ready

      const state = await invoke('axis:execute-dry-run', {
        approvedTaskIds: ['task-1'],
        expectedRevision: 1,
        runId: 'run-1',
        sessionId,
      })

      expect(await readFile(filePath, 'utf8')).toBe('replanned')
      expect(await readFile(secondFilePath, 'utf8')).toBe('replanned-two')
      expect(state).toMatchObject({ status: 'failed' })
      const decisionIds = state.events
        .filter((event) => event.type === 'pivot-decided')
        .map((event) => event.pivotDecisionId!)
      expect(decisionIds).toHaveLength(2)
      expect(ai.generateText).toHaveBeenCalledTimes(7)
      expect(gateRuns).toBe(5)

      const evidence = new AxisPivotFailureEvidenceRegistry(databasePath)
      const continuations = new AxisPivotContinuationRegistry(databasePath)
      const schedules = new AxisPivotReplanTaskScheduleRegistry(databasePath)
      const reviewedTasks = new AxisPivotReplanReviewedTaskRegistry(databasePath)
      const drives = new AxisPivotReplanRunDriveRegistry(databasePath)
      const states = new AxisRunStateRegistry(databasePath)
      const replanDecisionId = decisionIds[1]!
      const replanHandoff = continuations.findByDecision(replanDecisionId)
      expect(evidence.findBySource('run-1', state.revision - 1)).toMatchObject({
        category: 'direction',
        retryDecisionId: decisionIds[0],
        source: 'post-retry-task-failure',
      })
      expect(replanHandoff).toMatchObject({
        action: 'replan',
        status: 'pending-guarded-review',
      })
      const schedule = schedules.findBySource(replanDecisionId, 1)
      const secondSchedule = schedules.findBySource(replanDecisionId, 5)
      expect(schedule).toMatchObject({
        childRunId: replanHandoff?.targetRunId,
        taskId: 'child-task-1',
      })
      expect(secondSchedule).toMatchObject({
        childRunId: replanHandoff?.targetRunId,
        dependencyTaskIds: ['child-task-1'],
        taskId: 'child-task-2',
      })
      expect(reviewedTasks.findBySchedule(schedule!.scheduleId)).toMatchObject({
        continuationAttempt: {
          guardedResult: { execution: { status: 'completed' } },
          status: 'completed',
        },
        status: 'completed',
      })
      expect(reviewedTasks.findBySchedule(secondSchedule!.scheduleId)).toMatchObject({
        continuationAttempt: {
          guardedResult: { execution: { status: 'completed' } },
          status: 'completed',
        },
        status: 'completed',
      })
      expect(states.get(schedule!.childRunId)).toMatchObject({
        status: 'completed',
        tasks: [
          { status: 'completed', taskId: 'child-task-1' },
          { status: 'completed', taskId: 'child-task-2' },
        ],
      })
      expect(drives.find(replanDecisionId)).toMatchObject({
        childRunId: schedule!.childRunId,
        completedTaskIds: ['child-task-1', 'child-task-2'],
        finalStateRevision: states.get(schedule!.childRunId)!.revision,
        scheduleIds: [schedule!.scheduleId, secondSchedule!.scheduleId],
        status: 'completed',
      })
      drives.close()
      states.close()
      reviewedTasks.close()
      schedules.close()
      continuations.close()
      evidence.close()
    } finally {
      resources?.close()
      await rm(root, { force: true, recursive: true })
    }
  })
})

function seed(databasePath: string, projectRoot: string): string {
  const sessions = new SessionRegistry(databasePath)
  const session = sessions.create(projectRoot, 'Pivot failure IPC test')
  sessions.close()

  const plan = axisShadowResult('run-1', session.id)
  const plans = new AxisShadowRunRegistry(databasePath)
  plans.save(plan)
  plans.close()
  const states = new AxisRunStateRegistry(databasePath)
  states.create(plan, {
    ...axisBudget(),
    maxPivots: 3,
    maxRetriesPerTask: 2,
  })
  states.close()
  const settings = new AxisSettingsStore(databasePath)
  settings.setDryRunEnabled(true)
  settings.close()
  const providers = new ProviderStore({
    decrypt: (value) => value,
    encrypt: (value) => value,
  }, databasePath)
  providers.save({
    apiKey: 'sk-pivot-test',
    baseUrl: 'https://api.example.com/v1',
    id: 'pivot-provider',
    kind: 'custom',
    label: 'Pivot provider',
    model: 'test-model',
  })
  providers.setActive('pivot-provider')
  providers.close()
  return session.id
}

function seedGuardedRetry(
  databasePath: string,
  projectRoot: string,
  filePath: string,
): string {
  const sessions = new SessionRegistry(databasePath)
  const session = sessions.create(projectRoot, 'Pivot guarded retry IPC test')
  sessions.close()
  const base = axisShadowResult('run-1', session.id)
  const plan: AxisShadowRunResult = {
    ...base,
    dag: {
      ...base.dag!,
      tasks: [{
        assignedFiles: [filePath],
        dependencies: [],
        estimatedComplexity: 1,
        id: 'task-1',
        objective: 'Safely update one file',
        requiredTools: ['fs.safeWrite'],
        requiredGates: ['compile', 'test'],
        requiresHumanReview: false,
        spawnDepth: 1 as const,
        title: 'Safe write',
      }],
    },
    schedule: {
      batches: [['task-1']],
      orderedTaskIds: ['task-1'],
      warnings: [],
    },
  }
  const plans = new AxisShadowRunRegistry(databasePath)
  plans.save(plan)
  plans.close()
  const states = new AxisRunStateRegistry(databasePath)
  states.create(plan, {
    ...axisBudget(),
    maxPivots: 3,
    maxRetriesPerTask: 2,
  })
  states.close()
  const settings = new AxisSettingsStore(databasePath)
  settings.setDryRunEnabled(true)
  settings.close()
  const providers = new ProviderStore({
    decrypt: (value) => value,
    encrypt: (value) => value,
  }, databasePath)
  providers.save({
    apiKey: 'sk-pivot-test',
    baseUrl: 'https://api.example.com/v1',
    id: 'pivot-provider',
    kind: 'custom',
    label: 'Pivot provider',
    model: 'test-model',
  })
  providers.setActive('pivot-provider')
  providers.close()
  return session.id
}

async function invoke<K extends keyof IPCContract>(
  channel: K,
  request: IPCContract[K]['request'],
): Promise<IPCContract[K]['response']> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`)
  const mainFrame = { url: electron.trustedUrl }
  const sender = { id: 1, mainFrame, send: vi.fn() }
  return await handler({
    sender,
    senderFrame: mainFrame,
  }, request) as IPCContract[K]['response']
}
