import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AxisFileLeaseBinding } from '../../src/shared/axis-file-lease-contracts'
import {
  AxisFileFingerprintOwnershipError,
  AxisFileFingerprintProofError,
} from '../../src/main/services/axis-file-fingerprint-ports'
import { AxisExternalFileFingerprintAdapter } from '../../src/main/services/axis-external-file-fingerprint-adapter'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { projectBindingReader } from '../fixtures/axis-project-binding'

const tempDirectories: string[] = []
const proofSecret = Buffer.alloc(32, 7)

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('AxisExternalFileFingerprintAdapter', () => {
  it('captures content evidence for existing and missing targets through a narrow task Port', async () => {
    const fixture = createFixture()
    const task = fixture.adapter.openTaskPort(binding('task-1'))

    const evidence = await task.captureAll({
      filePaths: ['src/new.ts', 'src/app.ts'],
    })

    expect(evidence.map((item) => item.projectRelativePath)).toEqual([
      'src/app.ts',
      'src/new.ts',
    ])
    expect(evidence[0]?.state).toMatchObject({
      byteLength: Buffer.byteLength('export const value = 1\n'),
      kind: 'exists',
    })
    expect(evidence[1]?.state).toEqual({ kind: 'missing' })
    expect((await task.verifyAll({ evidence })).status).toBe('matched')
    expect(Object.keys(task).sort()).toEqual(['captureAll', 'verifyAll'])
  })

  it('detects content modification even when size and mtime are preserved', async () => {
    const fixture = createFixture()
    const task = fixture.adapter.openTaskPort(binding('task-1'))
    const [evidence] = await task.captureAll({ filePaths: ['src/app.ts'] })
    expect(evidence).toBeDefined()
    const target = path.join(fixture.root, 'src', 'app.ts')
    const preserved = new Date('2026-07-27T00:00:00.000Z')
    utimesSync(target, preserved, preserved)
    writeFileSync(target, 'export const value = 2\n')
    utimesSync(target, preserved, preserved)

    const result = await task.verifyAll({ evidence: [evidence!] })

    expect(result.status).toBe('rejected')
    expect(result.results).toMatchObject([{ reason: 'modified', status: 'rejected' }])
  })

  it('detects deletion and creation relative to the captured state', async () => {
    const fixture = createFixture()
    const task = fixture.adapter.openTaskPort(binding('task-1'))
    const evidence = await task.captureAll({ filePaths: ['src/app.ts', 'src/new.ts'] })
    unlinkSync(path.join(fixture.root, 'src', 'app.ts'))
    writeFileSync(path.join(fixture.root, 'src', 'new.ts'), 'created externally\n')

    const result = await task.verifyAll({ evidence })

    expect(result.status).toBe('rejected')
    expect(result.results.map((item) => [item.projectRelativePath, item.reason])).toEqual([
      ['src/app.ts', 'deleted'],
      ['src/new.ts', 'created'],
    ])
  })

  it('detects same-content file replacement using the file instance fingerprint', async () => {
    const fixture = createFixture()
    const task = fixture.adapter.openTaskPort(binding('task-1'))
    const [evidence] = await task.captureAll({ filePaths: ['src/app.ts'] })
    const target = path.join(fixture.root, 'src', 'app.ts')
    renameSync(target, path.join(fixture.root, 'src', 'original.ts'))
    writeFileSync(target, 'export const value = 1\n')

    const result = await task.verifyAll({ evidence: [evidence!] })

    expect(result.results).toMatchObject([{ reason: 'replaced', status: 'rejected' }])
  })

  it('rejects stale, cross-task, and tampered evidence', async () => {
    let now = new Date('2026-07-27T00:00:00.000Z')
    const fixture = createFixture(() => now, 1_000)
    const taskOne = fixture.adapter.openTaskPort(binding('task-1'))
    const taskTwo = fixture.adapter.openTaskPort(binding('task-2'))
    const [evidence] = await taskOne.captureAll({ filePaths: ['src/app.ts'] })

    await expect(taskTwo.verifyAll({ evidence: [evidence!] }))
      .rejects.toBeInstanceOf(AxisFileFingerprintOwnershipError)
    await expect(taskOne.verifyAll({
      evidence: [{ ...evidence!, fileKey: 'f'.repeat(64) }],
    })).rejects.toBeInstanceOf(AxisFileFingerprintProofError)

    now = new Date('2026-07-27T00:00:01.000Z')
    const stale = await taskOne.verifyAll({ evidence: [evidence!] })
    expect(stale.results).toMatchObject([{ reason: 'stale', status: 'rejected' }])
  })

  it('fails closed for project escapes, directories, and unknown session roots', async () => {
    const fixture = createFixture()
    const task = fixture.adapter.openTaskPort(binding('task-1'))

    await expect(task.captureAll({
      filePaths: [path.join(fixture.root, '..', 'outside.ts')],
    })).rejects.toThrow(/outside/i)
    await expect(task.captureAll({
      filePaths: ['src'],
    })).rejects.toThrow(/regular file/i)
    await expect(fixture.adapter.openTaskPort({
      ...binding('task-1'),
      sessionId: 'session-other',
    }).captureAll({
      filePaths: ['src/app.ts'],
    })).rejects.toThrow(/session/i)
  })
})

function binding(taskId: string): AxisFileLeaseBinding {
  return {
    projectId: 'project-1',
    runId: 'run-1',
    sessionId: 'session-1',
    taskId,
  }
}

function createFixture(
  clock: () => Date = () => new Date('2026-07-27T00:00:00.000Z'),
  evidenceTtlMs = 60_000,
) {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-file-fingerprint-'))
  tempDirectories.push(root)
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'app.ts'), 'export const value = 1\n')
  const projectBindings = projectBindingReader(root)
  const identity = new AxisMainProjectFileIdentityAdapter({ projectBindings })
  const adapter = new AxisExternalFileFingerprintAdapter({
    clock,
    evidenceTtlMs,
    identity,
    projectBindings,
    proofSecret,
  })
  return { adapter, root }
}
