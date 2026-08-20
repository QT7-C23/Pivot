import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AxisFileLeaseConflictError,
  type AxisFileLeaseBinding,
} from '../../src/main/services/axis-file-lease-ports'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { SqliteAxisFileLeaseStore } from '../../src/main/services/sqlite-axis-file-lease-store'
import { projectBindingReader } from '../fixtures/axis-project-binding'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('SqliteAxisFileLeaseStore', () => {
  it('enforces one active writer across tasks and runs', async () => {
    const fixture = createFixture()
    const taskOne = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const taskTwo = fixture.store.openTaskPort(binding('run-2', 'session-2', 'task-2'))

    const lease = await taskOne.acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })
    await expect(taskTwo.acquire({ filePath: 'src/app.ts', ttlMs: 60_000 }))
      .rejects.toBeInstanceOf(AxisFileLeaseConflictError)
    expect((await taskOne.listOwn()).map((item) => item.leaseId)).toEqual([lease.leaseId])
    expect(await taskTwo.listOwn()).toEqual([])

    await taskOne.release({ expectedVersion: lease.version, leaseId: lease.leaseId })
    expect((await taskTwo.acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })).taskId).toBe('task-2')
    fixture.store.close()
  })

  it('rejects stale versions and lease ownership forgery', async () => {
    const fixture = createFixture()
    const taskOne = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const taskTwo = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-2'))
    const lease = await taskOne.acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })
    const renewed = await taskOne.renew({
      expectedVersion: lease.version,
      leaseId: lease.leaseId,
      ttlMs: 60_000,
    })

    await expect(taskOne.release({
      expectedVersion: lease.version,
      leaseId: lease.leaseId,
    })).rejects.toThrow(/version conflict/i)
    await expect(taskTwo.release({
      expectedVersion: renewed.version,
      leaseId: lease.leaseId,
    })).rejects.toThrow(/not owned/i)
    expect(Object.keys(taskOne).sort()).toEqual([
      'acquire',
      'acquireAll',
      'listOwn',
      'release',
      'releaseAll',
      'renew',
      'renewAll',
      'verifyAll',
    ])
    expect('listActive' in taskOne).toBe(false)
    expect('releaseForRun' in taskOne).toBe(false)
    expect('releaseForSession' in taskOne).toBe(false)
    fixture.store.close()
  })

  it('expires leases before reuse and prevents renewal after expiry', async () => {
    let now = new Date('2026-07-27T00:00:00.000Z')
    const fixture = createFixture(() => now)
    const taskOne = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const taskTwo = fixture.store.openTaskPort(binding('run-2', 'session-2', 'task-2'))
    const lease = await taskOne.acquire({ filePath: 'src/app.ts', ttlMs: 1_000 })

    now = new Date('2026-07-27T00:00:01.000Z')
    expect(await taskOne.listOwn()).toEqual([])
    await expect(taskOne.renew({
      expectedVersion: lease.version,
      leaseId: lease.leaseId,
      ttlMs: 1_000,
    })).rejects.toThrow(/not active|expired/i)
    expect((await taskTwo.acquire({ filePath: 'src/app.ts', ttlMs: 1_000 })).status).toBe('active')
    fixture.store.close()
  })

  it('supports run cleanup without exposing Admin capabilities to tasks', async () => {
    const fixture = createFixture()
    const task = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    await task.acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })

    expect(await fixture.store.listActive('project-1')).toHaveLength(1)
    expect(fixture.store.releaseForRun({ runId: 'run-1', sessionId: 'session-1' })).toBe(1)
    expect(await fixture.store.listActive('project-1')).toEqual([])
    fixture.store.close()
  })

  it('supports session cleanup across runs without releasing another session', async () => {
    const fixture = createFixture()
    await fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
      .acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })
    await fixture.store.openTaskPort(binding('run-2', 'session-1', 'task-2'))
      .acquire({ filePath: 'src/other.ts', ttlMs: 60_000 })
    await fixture.store.openTaskPort(binding('run-3', 'session-2', 'task-3'))
      .acquire({ filePath: 'src/third.ts', ttlMs: 60_000 })

    expect(fixture.store.releaseForSession({ sessionId: 'session-1' })).toBe(2)
    expect(await fixture.store.listActive('project-1')).toMatchObject([{
      runId: 'run-3',
      sessionId: 'session-2',
    }])
    fixture.store.close()
  })

  it('recovers active leases and versions after reopening SQLite', async () => {
    const directory = createTempDirectory('pivot-file-lease-db-')
    const databasePath = path.join(directory, 'leases.db')
    const projectRoot = createProject()
    const identity = identityAdapter(projectRoot)
    const first = new SqliteAxisFileLeaseStore(identity, databasePath, {
      clock: () => new Date('2026-07-27T00:00:00.000Z'),
    })
    const lease = await first.openTaskPort(binding('run-1', 'session-1', 'task-1'))
      .acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })
    first.close()

    const reopened = new SqliteAxisFileLeaseStore(identity, databasePath, {
      clock: () => new Date('2026-07-27T00:00:30.000Z'),
    })
    expect(await reopened.listActive('project-1')).toMatchObject([{
      leaseId: lease.leaseId,
      taskId: 'task-1',
      version: 1,
    }])
    reopened.close()
  })
})

function binding(runId: string, sessionId: string, taskId: string): AxisFileLeaseBinding {
  return { projectId: 'project-1', runId, sessionId, taskId }
}

function createFixture(clock: () => Date = () => new Date('2026-07-27T00:00:00.000Z')) {
  const projectRoot = createProject()
  const store = new SqliteAxisFileLeaseStore(identityAdapter(projectRoot), ':memory:', { clock })
  return { projectRoot, store }
}

function identityAdapter(projectRoot: string) {
  return new AxisMainProjectFileIdentityAdapter({
    projectBindings: projectBindingReader(projectRoot, {
      sessionIds: ['session-1', 'session-2'],
    }),
  })
}

function createProject(): string {
  const root = createTempDirectory('pivot-file-lease-project-')
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'app.ts'), 'export {}\n')
  return root
}

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
