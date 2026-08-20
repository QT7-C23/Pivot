import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AxisMainSafeWriteProposalFileReaderAdapter,
  AxisSafeWriteProposalService,
} from '../../src/main/services/axis-safe-write-proposal'
import type {
  AxisSafeWriteProposalFileReaderPort,
  AxisSafeWriteProposalModelPort,
  AxisSafeWriteProposalRunStatePort,
} from '../../src/main/services/axis-safe-write-proposal-ports'
import type { AxisReviewedProposalReceiptIssuerPort } from '../../src/main/services/axis-reviewed-proposal-ports'
import type { AxisProjectBindingReaderPort } from '../../src/main/services/axis-project-binding-ports'
import type { AxisGuardedTaskReaderPort } from '../../src/main/services/axis-guarded-safe-write-ports'
import type { AxisRunState, AxisTask } from '../../src/shared/axis-engine-contracts'
import { AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS } from '../../src/shared/axis-guarded-safe-write-contracts'
import { recordAxisSafeWriteProposalUsage } from '../../src/shared/axis-run-state'

const temporaryRoots: string[] = []

const task: AxisTask = {
  assignedFiles: ['src/one.ts', 'src/new.ts'],
  dependencies: [],
  estimatedComplexity: 2,
  id: 'task-1',
  objective: 'Update one file and create another',
  requiredTools: ['fs.safeWrite'],
  requiredGates: ['compile', 'test'],
  requiresHumanReview: false,
  spawnDepth: 1,
  title: 'Safe write',
}

const request = {
  expectedRevision: 1,
  runId: 'run-1',
  sessionId: 'session-1',
  taskId: 'task-1',
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })))
})

describe('AxisSafeWriteProposalService', () => {
  it('reads authoritative snapshots and accepts only an exact model write set', async () => {
    const root = await project()
    const model = modelPort()
    const service = createService(root, { model })

    const result = await service.propose(request)
    const proposal = result.proposal

    expect(proposal).toMatchObject({
      expectedRevision: 2,
      files: [{
        filePath: 'src/one.ts',
        originalContent: 'before',
        originalState: 'existing',
        proposedContent: 'after',
      }, {
        filePath: 'src/new.ts',
        originalContent: '',
        originalSha256: null,
        originalState: 'missing',
        proposedContent: 'created',
      }],
      proposalId: 'proposal-test',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })
    expect(proposal.files[0]?.originalSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.receipt).toMatchObject({
      expectedRevision: 2,
      proposalId: 'proposal-test',
      receiptId: 'reviewed-proposal-test',
    })
    expect(result.runState).toMatchObject({
      revision: 2,
      usage: { costUsd: 0.001, tokens: 120 },
    })
    expect(model.generate).toHaveBeenCalledWith({
      objective: 'Safe write objective',
      sources: [
        { content: 'before', filePath: 'src/one.ts', state: 'existing' },
        { content: '', filePath: 'src/new.ts', state: 'missing' },
      ],
      task,
    })
    expect(await readFile(path.join(root, 'src', 'one.ts'), 'utf8')).toBe('before')
  })

  it('rejects stale, non-pending, cross-session and unsafe tasks before calling the model', async () => {
    const root = await project()
    const model = modelPort()
    const stale = createService(root, {
      model,
      runStates: runStatePort({ revision: 2 }),
    })
    await expect(stale.propose(request)).rejects.toThrow(/revision conflict/i)

    const running = createService(root, {
      model,
      runStates: runStatePort({ taskStatus: 'running' }),
    })
    await expect(running.propose(request)).rejects.toThrow(/pending/i)

    const crossSession = createService(root, {
      model,
      runStates: runStatePort({ sessionId: 'session-other' }),
    })
    await expect(crossSession.propose(request)).rejects.toThrow(/run state/i)

    const unsafe = createService(root, {
      model,
      tasks: taskPort({ ...task, requiredTools: ['term.run'] }),
    })
    await expect(unsafe.propose(request)).rejects.toThrow(/fs\.safeWrite/i)
    expect(model.generate).not.toHaveBeenCalled()
  })

  it('rejects missing, extra and malformed model files without returning a proposal', async () => {
    const root = await project()
    for (const writes of [
      [{ content: 'after', filePath: 'src/one.ts' }],
      [
        { content: 'after', filePath: 'src/one.ts' },
        { content: 'created', filePath: 'src/new.ts' },
        { content: 'forged', filePath: 'src/extra.ts' },
      ],
    ]) {
      const runStates = runStatePort()
      await expect(createService(root, {
        model: modelPort({ writes }),
        runStates,
      }).propose(request)).rejects.toThrow(/assigned files/i)
      expect(runStates.recordUsage).toHaveBeenCalledOnce()
    }

    const malformedStates = runStatePort()
    await expect(createService(root, {
      model: modelPort({
        commands: ['npm.cmd test'],
        writes: [
          { content: 'after', filePath: 'src/one.ts' },
          { content: 'created', filePath: 'src/new.ts' },
        ],
      }),
      runStates: malformedStates,
    }).propose(request)).rejects.toThrow()
    expect(malformedStates.recordUsage).toHaveBeenCalledOnce()
  })

  it('durably hard-stops proposal generation when measured model usage exceeds budget', async () => {
    const root = await project()
    const runStates = runStatePort({ maxTokens: 10 })

    await expect(createService(root, {
      model: modelPort(),
      runStates,
    }).propose(request)).rejects.toThrow(/token-limit/i)
    expect(runStates.recordUsage).toHaveBeenCalledOnce()
    expect(runStates.find(request)).toMatchObject({
      status: 'failed',
      tasks: [{ status: 'failed' }],
    })
  })

  it('resolves project-relative files and rejects traversal in the real Main adapter', async () => {
    const root = await project()
    const adapter = new AxisMainSafeWriteProposalFileReaderAdapter()
    const binding = projectBinding(root)

    await expect(adapter.readAll(binding, ['src/one.ts'])).resolves.toMatchObject([{
      content: 'before',
      filePath: 'src/one.ts',
      state: 'existing',
    }])
    await expect(adapter.readAll(binding, ['../outside.ts'])).rejects.toThrow(/outside/i)
  })

  it('rejects oversized individual and aggregate source snapshots before model generation', async () => {
    const root = await project()
    const adapter = new AxisMainSafeWriteProposalFileReaderAdapter()
    const oversizedPath = path.join(root, 'src', 'oversized.ts')
    await writeFile(oversizedPath, 'x'.repeat(1024 * 1024 + 1), 'utf8')

    await expect(
      adapter.readAll(projectBinding(root), ['src/oversized.ts']),
    ).rejects.toThrow(/exceeds 1 MiB/i)

    const model = modelPort()
    const content = 'x'.repeat(AXIS_GUARDED_SAFE_WRITE_MAX_CONTENT_CHARS / 2 + 1)
    const files: AxisSafeWriteProposalFileReaderPort = {
      readAll: vi.fn(async () => task.assignedFiles.map((filePath) => ({
        content,
        filePath,
        sha256: 'a'.repeat(64),
        state: 'existing' as const,
      }))),
    }
    await expect(createService(root, {
      files,
      model,
    }).propose(request)).rejects.toThrow(/aggregate hard limit/i)
    expect(model.generate).not.toHaveBeenCalled()
  })
})

function createService(root: string, overrides: {
  files?: AxisSafeWriteProposalFileReaderPort
  model?: AxisSafeWriteProposalModelPort
  receipts?: AxisReviewedProposalReceiptIssuerPort
  runStates?: AxisSafeWriteProposalRunStatePort
  tasks?: AxisGuardedTaskReaderPort
} = {}): AxisSafeWriteProposalService {
  return new AxisSafeWriteProposalService({
    clock: () => new Date('2026-07-29T08:00:00.000Z'),
    files: overrides.files ?? new AxisMainSafeWriteProposalFileReaderAdapter(),
    idFactory: () => 'proposal-test',
    model: overrides.model ?? modelPort(),
    projects: projectPort(root),
    receipts: overrides.receipts ?? receiptPort(),
    runStates: overrides.runStates ?? runStatePort(),
    tasks: overrides.tasks ?? taskPort(),
  })
}

function receiptPort(): AxisReviewedProposalReceiptIssuerPort {
  return {
    capture: async ({ project, runId, sessionId, taskId, filePaths }) => ({
      files: filePaths.map((filePath, index) => ({
        evidence: {
          capturedAt: '2026-07-29T08:00:00.000Z',
          evidenceId: `evidence-${index}`,
          expiresAt: '2026-07-29T08:01:00.000Z',
          fileKey: `${index + 1}`.repeat(64),
          projectId: project.projectId,
          projectRelativePath: filePath,
          proof: 'a'.repeat(43),
          runId,
          schemaVersion: 1,
          sessionId,
          state: index === 0
            ? {
                byteLength: 6,
                contentSha256: '6db7d803e74f1ffa7d8f5adc0bf95b3e15bf4c8373fffadf546227cc6c6742cb',
                fileInstanceSha256: 'f'.repeat(64),
                kind: 'exists' as const,
              }
            : { kind: 'missing' as const },
          taskId,
        },
        filePath,
      })),
      projectId: project.projectId,
      runId,
      sessionId,
      taskId,
    }),
    issue: async ({ baseline, proposal }) => ({
      expectedRevision: proposal.expectedRevision,
      expiresAt: '2026-07-29T08:01:00.000Z',
      files: baseline.files.map(({ evidence, filePath }, index) => ({
        fileKey: evidence.fileKey,
        filePath,
        projectRelativePath: evidence.projectRelativePath,
        proposedContentSha256: `${index + 3}`.repeat(64),
        state: evidence.state,
      })),
      issuedAt: '2026-07-29T08:00:00.000Z',
      issuer: 'pivot-main' as const,
      projectId: baseline.projectId,
      proposalId: proposal.proposalId,
      receiptId: 'reviewed-proposal-test',
      runId: proposal.runId,
      schemaVersion: 1 as const,
      sessionId: proposal.sessionId,
      signature: '9'.repeat(64),
      taskId: proposal.taskId,
    }),
  }
}

function modelPort(output: unknown = {
  writes: [
    { content: 'after', filePath: 'src/one.ts' },
    { content: 'created', filePath: 'src/new.ts' },
  ],
}): AxisSafeWriteProposalModelPort {
  return {
    generate: vi.fn(async () => ({
      output,
      usage: { costUsd: 0.001, tokens: 120 },
    })),
  }
}

function projectPort(root: string): AxisProjectBindingReaderPort {
  return {
    findBySession(sessionId) {
      return sessionId === 'session-1' ? projectBinding(root) : null
    },
  }
}

function projectBinding(root: string) {
  return {
    boundAt: '2026-07-29T00:00:00.000Z',
    projectId: 'project-1',
    projectRoot: root,
    schemaVersion: 1 as const,
    sessionId: 'session-1',
  }
}

function taskPort(nextTask: AxisTask = task): AxisGuardedTaskReaderPort {
  return {
    findTask(binding) {
      return binding.runId === 'run-1'
        && binding.sessionId === 'session-1'
        && binding.taskId === 'task-1'
        ? nextTask
        : null
    },
  }
}

function runStatePort(options: {
  maxTokens?: number
  revision?: number
  sessionId?: string
  taskStatus?: AxisRunState['tasks'][number]['status']
} = {}): AxisSafeWriteProposalRunStatePort {
  let state: AxisRunState = {
    budget: {
      maxCostUsd: 1,
      maxDurationMs: 60_000,
      maxGateCyclesPerFile: 2,
      maxPivots: 0,
      maxRetriesPerTask: 0,
      maxTokens: options.maxTokens ?? 10_000,
      maxWorkers: 1,
    },
    createdAt: '2026-07-29T00:00:00.000Z',
    events: [{
      detail: '',
      revision: 1,
      taskId: null,
      timestamp: '2026-07-29T00:00:00.000Z',
      type: 'initialized',
    }],
    objective: 'Safe write objective',
    restartCount: 0,
    revision: options.revision ?? 1,
    runId: 'run-1',
    sessionId: options.sessionId ?? 'session-1',
    status: 'planned',
    tasks: [{
      attempts: 0,
      error: null,
      status: options.taskStatus ?? 'pending',
      taskId: 'task-1',
      updatedAt: '2026-07-29T00:00:00.000Z',
      usage: {
        costUsd: 0,
        durationMs: 0,
        gateCyclesForFile: 0,
        pivots: 0,
        retriesForTask: 0,
        tokens: 0,
      },
    }],
    updatedAt: '2026-07-29T00:00:00.000Z',
    usage: {
      costUsd: 0,
      durationMs: 0,
      gateCyclesForFile: 0,
      pivots: 0,
      retriesForTask: 0,
      tokens: 0,
    },
  }
  const port: AxisSafeWriteProposalRunStatePort = {
    find: vi.fn((binding) => (
      binding.runId === state.runId && binding.sessionId === state.sessionId
        ? state
        : null
    )),
    recordUsage: vi.fn((usageRequest) => {
      if (usageRequest.expectedRevision !== state.revision) {
        throw new Error('Axis run state revision conflict')
      }
      state = recordAxisSafeWriteProposalUsage(
        state,
        usageRequest.taskId,
        usageRequest.usage,
        usageRequest.durationMs,
        '2026-07-29T08:00:00.000Z',
      )
      return state
    }),
  }
  return port
}

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pivot-axis-proposal-'))
  temporaryRoots.push(root)
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'one.ts'), 'before', 'utf8')
  return root
}
