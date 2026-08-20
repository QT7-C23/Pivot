import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { AxisRunLeaseLifecycleCoordinator } from '../../src/main/services/axis-run-lease-lifecycle'
import { SqliteAxisFileLeaseStore } from '../../src/main/services/sqlite-axis-file-lease-store'
import { SqliteAxisProjectBindingStore } from '../../src/main/services/sqlite-axis-project-binding-store'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('AxisRunLeaseLifecycleCoordinator', () => {
  it('releases only the requested run, then all remaining leases for the session', async () => {
    const fixture = await createFixture()
    await fixture.leases.openTaskPort(binding(fixture.projectId, 'run-1', 'session-1', 'task-1'))
      .acquire({ filePath: 'src/one.ts', ttlMs: 60_000 })
    await fixture.leases.openTaskPort(binding(fixture.projectId, 'run-2', 'session-1', 'task-2'))
      .acquire({ filePath: 'src/two.ts', ttlMs: 60_000 })
    await fixture.leases.openTaskPort(binding(fixture.projectId, 'run-3', 'session-2', 'task-3'))
      .acquire({ filePath: 'src/three.ts', ttlMs: 60_000 })

    expect(fixture.lifecycle.cleanup({
      reason: 'completed',
      runId: 'run-1',
      scope: 'run',
      sessionId: 'session-1',
    })).toMatchObject({
      reason: 'completed',
      releasedLeaseCount: 1,
      runId: 'run-1',
      scope: 'run',
    })
    expect(await fixture.leases.listActive(fixture.projectId)).toHaveLength(2)

    expect(fixture.lifecycle.cleanup({
      reason: 'session-closed',
      scope: 'session',
      sessionId: 'session-1',
    })).toMatchObject({
      releasedLeaseCount: 1,
      runId: null,
      scope: 'session',
    })
    expect(await fixture.leases.listActive(fixture.projectId)).toMatchObject([{
      runId: 'run-3',
      sessionId: 'session-2',
    }])
    expect(fixture.lifecycle.cleanup({
      reason: 'session-closed',
      scope: 'session',
      sessionId: 'session-1',
    }).releasedLeaseCount).toBe(0)
    fixture.close()
  })

  it('propagates a real closed-database cleanup failure without inventing a receipt', async () => {
    const fixture = await createFixture(true)
    await fixture.leases.openTaskPort(binding(fixture.projectId, 'run-1', 'session-1', 'task-1'))
      .acquire({ filePath: 'src/one.ts', ttlMs: 60_000 })
    fixture.leases.close()

    expect(() => fixture.lifecycle.cleanup({
      reason: 'failed',
      runId: 'run-1',
      scope: 'run',
      sessionId: 'session-1',
    })).toThrow()

    const recovered = new SqliteAxisFileLeaseStore(
      fixture.identity,
      fixture.leaseDatabasePath,
      { clock: fixture.clock },
    )
    expect(await recovered.listActive(fixture.projectId)).toHaveLength(1)
    recovered.close()
    fixture.projects.close()
  })
})

async function createFixture(persistLeases = false) {
  const root = createProject()
  const databaseDirectory = createTempDirectory('pivot-lease-lifecycle-db-')
  const projectDatabasePath = path.join(databaseDirectory, 'projects.db')
  const leaseDatabasePath = persistLeases
    ? path.join(databaseDirectory, 'leases.db')
    : ':memory:'
  const clock = () => new Date('2026-07-28T15:00:00.000Z')
  const projects = new SqliteAxisProjectBindingStore(projectDatabasePath, { clock })
  const first = await projects.bind({ projectRoot: root, sessionId: 'session-1' })
  await projects.bind({ projectRoot: root, sessionId: 'session-2' })
  const identity = new AxisMainProjectFileIdentityAdapter({
    projectBindings: projects.openReaderPort(),
  })
  const leases = new SqliteAxisFileLeaseStore(identity, leaseDatabasePath, { clock })
  const lifecycle = new AxisRunLeaseLifecycleCoordinator({ clock, leases })
  return {
    clock,
    close() {
      leases.close()
      projects.close()
    },
    identity,
    leaseDatabasePath,
    leases,
    lifecycle,
    projectId: first.projectId,
    projects,
  }
}

function binding(projectId: string, runId: string, sessionId: string, taskId: string) {
  return { projectId, runId, sessionId, taskId }
}

function createProject(): string {
  const root = createTempDirectory('pivot-lease-lifecycle-project-')
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'one.ts'), 'one')
  writeFileSync(path.join(root, 'src', 'two.ts'), 'two')
  writeFileSync(path.join(root, 'src', 'three.ts'), 'three')
  return root
}

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
