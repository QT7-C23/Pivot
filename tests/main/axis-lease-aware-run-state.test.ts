import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxisLeaseAwareRunStateStore } from '../../src/main/services/axis-lease-aware-run-state'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { AxisRunLeaseLifecycleCoordinator } from '../../src/main/services/axis-run-lease-lifecycle'
import { AxisRunStateRegistry } from '../../src/main/services/axis-run-state-registry'
import { SqliteAxisFileLeaseStore } from '../../src/main/services/sqlite-axis-file-lease-store'
import { SqliteAxisProjectBindingStore } from '../../src/main/services/sqlite-axis-project-binding-store'
import { axisBudget, axisShadowResult } from '../fixtures/axis-shadow-run'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('AxisLeaseAwareRunStateStore', () => {
  it('commits a terminal run state before cleanup and surfaces cleanup failure', () => {
    const runStates = new AxisRunStateRegistry(':memory:')
    runStates.create(axisShadowResult(), axisBudget())
    const cleanup = vi.fn(() => {
      expect(runStates.get('run-1')?.status).toBe('cancelled')
      throw new Error('lease cleanup failed')
    })
    const states = new AxisLeaseAwareRunStateStore({
      lifecycle: { cleanup },
      states: runStates,
    })

    expect(() => states.cancel({
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
    })).toThrow('lease cleanup failed')
    expect(runStates.get('run-1')?.status).toBe('cancelled')
    expect(cleanup).toHaveBeenCalledWith({
      reason: 'cancelled',
      runId: 'run-1',
      scope: 'run',
      sessionId: 'session-1',
    })
    runStates.close()
  })

  it('does not clean non-terminal transitions and cleans a failed task transition', () => {
    const runStates = new AxisRunStateRegistry(':memory:')
    runStates.create(axisShadowResult(), axisBudget())
    const cleanup = vi.fn(() => runReceipt('failed'))
    const states = new AxisLeaseAwareRunStateStore({
      lifecycle: { cleanup },
      states: runStates,
    })

    let state = states.startDryRun({
      approvedTaskIds: ['inspect'],
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
    })
    state = states.startTask({
      expectedRevision: state.revision,
      runId: state.runId,
      sessionId: state.sessionId,
      taskId: 'inspect',
    })
    expect(cleanup).not.toHaveBeenCalled()

    state = states.completeTask({
      expectedRevision: state.revision,
      result: {
        artifacts: [],
        findings: [],
        status: 'failed',
        summary: 'executor failed',
        taskId: 'inspect',
        usage: { costUsd: 0, durationMs: 1, tokens: 0 },
      },
      runId: state.runId,
      sessionId: state.sessionId,
    })
    expect(state.status).toBe('failed')
    expect(cleanup).toHaveBeenCalledWith({
      reason: 'failed',
      runId: 'run-1',
      scope: 'run',
      sessionId: 'session-1',
    })
    runStates.close()
  })

  it('opens a narrow guarded state Port and commits terminal state before cleanup failure', () => {
    const runStates = new AxisRunStateRegistry(':memory:')
    runStates.create(axisShadowResult(), axisBudget())
    const cleanup = vi.fn(() => {
      expect(runStates.get('run-1')?.status).toBe('failed')
      throw new Error('guarded cleanup failed')
    })
    const states = new AxisLeaseAwareRunStateStore({
      lifecycle: { cleanup },
      states: runStates,
    })
    const guarded = states.openGuardedExecutionPort()
    const claimed = guarded.claimTask({
      dependencyTaskIds: [],
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'inspect',
    })

    expect(() => guarded.finishTask({
      expectedRevision: claimed.revision,
      result: {
        artifacts: [],
        findings: ['permission-denied'],
        status: 'failed',
        summary: 'Permission denied',
        taskId: 'inspect',
        usage: { costUsd: 0, durationMs: 1, tokens: 0 },
      },
      runId: 'run-1',
      sessionId: 'session-1',
    })).toThrow('guarded cleanup failed')
    expect(runStates.get('run-1')).toMatchObject({
      status: 'failed',
      tasks: [{ error: 'Permission denied', status: 'failed' }],
    })
    runStates.close()
  })

  it('expires leases by TTL after a real cleanup-store interruption', async () => {
    const projectRoot = createProject()
    const databaseRoot = createTempDirectory('pivot-lease-aware-db-')
    const projectDatabasePath = path.join(databaseRoot, 'projects.db')
    const leaseDatabasePath = path.join(databaseRoot, 'leases.db')
    const clockState = { now: new Date('2026-07-28T16:00:00.000Z') }
    const clock = () => clockState.now
    const projects = new SqliteAxisProjectBindingStore(projectDatabasePath, { clock })
    const project = await projects.bind({ projectRoot, sessionId: 'session-1' })
    const identity = new AxisMainProjectFileIdentityAdapter({
      projectBindings: projects.openReaderPort(),
    })
    const leases = new SqliteAxisFileLeaseStore(identity, leaseDatabasePath, { clock })
    await leases.openTaskPort({
      projectId: project.projectId,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'inspect',
    }).acquire({ filePath: 'src/one.ts', ttlMs: 1_000 })
    const runStates = new AxisRunStateRegistry(':memory:', { clock })
    runStates.create(axisShadowResult(), axisBudget())
    const states = new AxisLeaseAwareRunStateStore({
      lifecycle: new AxisRunLeaseLifecycleCoordinator({ clock, leases }),
      states: runStates,
    })
    leases.close()

    expect(() => states.cancel({
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
    })).toThrow()
    expect(runStates.get('run-1')?.status).toBe('cancelled')

    clockState.now = new Date('2026-07-28T16:00:02.000Z')
    const recoveredLeases = new SqliteAxisFileLeaseStore(
      identity,
      leaseDatabasePath,
      { clock },
    )
    expect(await recoveredLeases.listActive(project.projectId)).toEqual([])
    recoveredLeases.close()
    runStates.close()
    projects.close()
  })
})

function runReceipt(reason: 'failed') {
  return {
    cleanedAt: '2026-07-28T16:00:00.000Z',
    reason,
    releasedLeaseCount: 0,
    runId: 'run-1',
    schemaVersion: 1 as const,
    scope: 'run' as const,
    sessionId: 'session-1',
  }
}

function createProject(): string {
  const root = createTempDirectory('pivot-lease-aware-project-')
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'one.ts'), 'one')
  return root
}

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
