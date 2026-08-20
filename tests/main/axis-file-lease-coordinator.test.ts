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

describe('AxisFileLeaseCoordinatorPort', () => {
  it('normalizes duplicate path spellings and acquires the canonical set atomically', async () => {
    const fixture = createFixture()
    const task = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const absoluteAppPath = path.join(fixture.projectRoot, 'src', 'app.ts')

    const leases = await task.acquireAll({
      filePaths: ['src/new.ts', absoluteAppPath, 'src/../src/app.ts'],
      ttlMs: 60_000,
    })

    expect(leases).toHaveLength(2)
    expect(leases.map((lease) => lease.fileKey)).toEqual(
      [...leases.map((lease) => lease.fileKey)].sort(),
    )
    expect(leases.map((lease) => lease.projectRelativePath).sort()).toEqual([
      'src/app.ts',
      'src/new.ts',
    ])
    expect(await task.listOwn()).toHaveLength(2)
    fixture.store.close()
  })

  it('leaves no partial leases when any requested file conflicts', async () => {
    const fixture = createFixture()
    const owner = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const contender = fixture.store.openTaskPort(binding('run-2', 'session-2', 'task-2'))
    const existing = await owner.acquire({ filePath: 'src/app.ts', ttlMs: 60_000 })

    await expect(contender.acquireAll({
      filePaths: ['src/free.ts', 'src/app.ts', 'src/another-free.ts'],
      ttlMs: 60_000,
    })).rejects.toBeInstanceOf(AxisFileLeaseConflictError)

    expect(await contender.listOwn()).toEqual([])
    expect(await fixture.store.listActive('project-1')).toMatchObject([{
      leaseId: existing.leaseId,
      taskId: 'task-1',
    }])
    fixture.store.close()
  })

  it('renews a set together and rolls back release when any version is stale', async () => {
    let now = new Date('2026-07-27T00:00:00.000Z')
    const fixture = createFixture(() => now)
    const task = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const acquired = await task.acquireAll({
      filePaths: ['src/app.ts', 'src/other.ts'],
      ttlMs: 60_000,
    })

    now = new Date('2026-07-27T00:00:10.000Z')
    const renewed = await task.renewAll({
      leases: acquired.map(({ leaseId, version }) => ({
        expectedVersion: version,
        leaseId,
      })),
      ttlMs: 120_000,
    })
    expect(new Set(renewed.map((lease) => lease.expiresAt))).toEqual(
      new Set(['2026-07-27T00:02:10.000Z']),
    )
    expect(renewed.every((lease) => lease.version === 2)).toBe(true)

    const separatelyRenewed = await task.renew({
      expectedVersion: renewed[0].version,
      leaseId: renewed[0].leaseId,
      ttlMs: 120_000,
    })
    await expect(task.releaseAll({
      leases: renewed.map(({ leaseId, version }) => ({
        expectedVersion: version,
        leaseId,
      })),
    })).rejects.toThrow(/version conflict/i)

    const stillOwned = await task.listOwn()
    expect(stillOwned.find((lease) => lease.leaseId === separatelyRenewed.leaseId))
      .toMatchObject({ status: 'active', version: 3 })
    expect(stillOwned.find((lease) => lease.leaseId !== separatelyRenewed.leaseId))
      .toMatchObject({ status: 'active', version: 2 })

    const released = await task.releaseAll({
      leases: stillOwned.map(({ leaseId, version }) => ({
        expectedVersion: version,
        leaseId,
      })),
    })
    expect(released.every((lease) => lease.status === 'released')).toBe(true)
    expect(await task.listOwn()).toEqual([])
    fixture.store.close()
  })

  it('verifies the complete active version set without mutating leases', async () => {
    const fixture = createFixture()
    const task = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const leases = await task.acquireAll({
      filePaths: ['src/app.ts', 'src/other.ts'],
      ttlMs: 60_000,
    })

    const verified = await task.verifyAll({
      leases: leases.map(({ leaseId, version }) => ({
        expectedVersion: version,
        leaseId,
      })),
    })

    expect(verified).toEqual(leases)
    await expect(task.verifyAll({
      leases: [
        { expectedVersion: leases[0].version, leaseId: leases[0].leaseId },
        { expectedVersion: leases[1].version + 1, leaseId: leases[1].leaseId },
      ],
    })).rejects.toThrow(/version conflict/i)
    expect(await task.listOwn()).toEqual(leases)
    fixture.store.close()
  })

  it('keeps batch mutations task-bound and does not expose Admin capabilities', async () => {
    const fixture = createFixture()
    const owner = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-1'))
    const attacker = fixture.store.openTaskPort(binding('run-1', 'session-1', 'task-2'))
    const leases = await owner.acquireAll({
      filePaths: ['src/app.ts', 'src/other.ts'],
      ttlMs: 60_000,
    })

    await expect(attacker.releaseAll({
      leases: leases.map(({ leaseId, version }) => ({
        expectedVersion: version,
        leaseId,
      })),
    })).rejects.toThrow(/not owned/i)
    expect(await owner.listOwn()).toHaveLength(2)
    expect(Object.keys(owner).sort()).toEqual([
      'acquire',
      'acquireAll',
      'listOwn',
      'release',
      'releaseAll',
      'renew',
      'renewAll',
      'verifyAll',
    ])
    expect('listActive' in owner).toBe(false)
    expect('releaseForRun' in owner).toBe(false)
    expect('releaseForSession' in owner).toBe(false)
    fixture.store.close()
  })
})

function binding(runId: string, sessionId: string, taskId: string): AxisFileLeaseBinding {
  return { projectId: 'project-1', runId, sessionId, taskId }
}

function createFixture(clock: () => Date = () => new Date('2026-07-27T00:00:00.000Z')) {
  const projectRoot = createProject()
  const identity = new AxisMainProjectFileIdentityAdapter({
    projectBindings: projectBindingReader(projectRoot, {
      sessionIds: ['session-1', 'session-2'],
    }),
  })
  const store = new SqliteAxisFileLeaseStore(identity, ':memory:', { clock })
  return { projectRoot, store }
}

function createProject(): string {
  const root = createTempDirectory('pivot-file-lease-coordinator-')
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'app.ts'), 'export {}\n')
  return root
}

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}
