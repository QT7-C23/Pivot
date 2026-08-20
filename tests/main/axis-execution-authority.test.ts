import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxisAuthorityAuditRegistry } from '../../src/main/services/axis-authority-audit-registry'
import { AxisExecutionAuthorityService } from '../../src/main/services/axis-execution-authority'
import { projectBindingReader } from '../fixtures/axis-project-binding'
import { AxisFakeMutatingExecutor } from '../../src/main/services/axis-fake-mutating-executor'
import { AxisCheckpointReceiptSchema, type AxisTask } from '../../src/shared/axis-engine-contracts'

let tempRoot = ''
let filePath = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-axis-authority-${Date.now()}`)
  filePath = path.join(tempRoot, 'source.ts')
  await mkdir(tempRoot, { recursive: true })
  await writeFile(filePath, 'before')
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Axis execution authority envelope', () => {
  it('signs a bounded fake-mutation capability and records a non-mutating audit receipt', async () => {
    const databasePath = path.join(tempRoot, 'authority.sqlite')
    const audit = new AxisAuthorityAuditRegistry(databasePath)
    const authority = service(audit)
    const envelope = await authority.issue(issueRequest())
    const executor = new AxisFakeMutatingExecutor({ audit, authority, clock: fixedClock })

    const receipt = await executor.execute({
      binding: expectedBinding(),
      envelope,
      intent: { contentSha256: sha256('after'), filePath, operation: 'write', toolName: 'fs.safeWrite' },
    })

    expect(receipt).toMatchObject({ mode: 'fake-mutation', status: 'simulated', taskId: 'inspect' })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('before')
    audit.close()
    const reopenedAudit = new AxisAuthorityAuditRegistry(databasePath)
    expect(reopenedAudit.list('run-1').map((entry) => entry.type)).toEqual(['authority-issued', 'mutation-simulated'])
    expect(reopenedAudit.deleteForSession('session-1')).toBe(2)
    expect(reopenedAudit.list('run-1')).toEqual([])
    reopenedAudit.close()
  })

  it('rejects tampered, expired, and cross-session envelopes', async () => {
    const authority = service()
    const envelope = await authority.issue(issueRequest())

    await expect(authority.verify({ ...envelope, allowedTools: ['fs.other'] }, expectedBinding())).rejects.toThrow(/signature/i)
    await expect(authority.verify(envelope, { ...expectedBinding(), sessionId: 'session-other' })).rejects.toThrow(/binding/i)
    const expired = service(undefined, () => new Date('2026-07-22T03:10:00.000Z'))
    await expect(expired.verify(envelope, expectedBinding())).rejects.toThrow(/expired/i)
  })

  it('rejects tools and files outside the signed capability', async () => {
    const authority = service()
    const envelope = await authority.issue(issueRequest())
    const executor = new AxisFakeMutatingExecutor({ authority, clock: fixedClock })

    await expect(executor.execute({
      binding: expectedBinding(),
      envelope,
      intent: { contentSha256: sha256('after'), filePath, operation: 'write', toolName: 'term.run' },
    })).rejects.toThrow(/tool capability/i)
    await expect(executor.execute({
      binding: expectedBinding(),
      envelope,
      intent: { contentSha256: sha256('after'), filePath: path.join(tempRoot, 'other.ts'), operation: 'write', toolName: 'fs.safeWrite' },
    })).rejects.toThrow(/file capability/i)
  })

  it('rejects authority issuance for task scope or project-root mismatches', async () => {
    const authority = service()
    const outsidePath = path.join(path.dirname(tempRoot), 'outside.ts')

    await expect(authority.issue({ ...issueRequest(), grantedTools: ['term.run'] })).rejects.toThrow(/task tool scope/i)
    await expect(authority.issue({ ...issueRequest(), grantedFilePaths: [outsidePath] })).rejects.toThrow(/project root|task file scope/i)
    await expect(authority.issue({ ...issueRequest(), projectRoot: path.dirname(tempRoot) })).rejects.toThrow(/authoritative session binding/i)
  })

  it('cannot issue safe-write authority while real execution is disabled', async () => {
    const authority = service()

    await expect(authority.issue({ ...issueRequest(), mode: 'safe-write' })).rejects.toThrow(/real file execution is disabled/i)
  })

  it('signs matching Lease and Fingerprint evidence into safe-write authority', async () => {
    const authority = service(undefined, fixedClock, true)
    const envelope = await authority.issue({
      ...issueRequest(),
      ...safeWriteEvidence(),
      mode: 'safe-write',
      projectId: 'project-1',
    })

    expect(envelope).toMatchObject({
      fileFingerprintEvidence: [{ fileKey: 'a'.repeat(64) }],
      fileLeaseEvidence: [{ leaseId: 'lease-1', version: 1 }],
      projectId: 'project-1',
    })
    await expect(authority.verify({
      ...envelope,
      fileLeaseEvidence: [{
        ...envelope.fileLeaseEvidence[0],
        version: 2,
      }],
    }, expectedBinding())).rejects.toThrow(/signature/i)
    await expect(authority.issue({
      ...issueRequest(),
      mode: 'safe-write',
      projectId: 'project-1',
    })).rejects.toThrow(/lease|fingerprint/i)
  })

  it('requires rollback ownership and a valid checkpoint receipt for every writable file', () => {
    expect(() => AxisCheckpointReceiptSchema.parse({
      checkpointId: null,
      filePath,
      priorState: 'existing-file',
      rollbackAction: 'restore-checkpoint',
    })).toThrow(/checkpoint/i)
    expect(() => AxisCheckpointReceiptSchema.parse({
      checkpointId: 'checkpoint-1',
      filePath,
      priorState: 'new-file',
      rollbackAction: 'delete-created-file',
    })).toThrow(/checkpoint/i)
  })
})

function service(
  audit?: AxisAuthorityAuditRegistry,
  clock: () => Date = fixedClock,
  realExecutionEnabled = false,
) {
  return new AxisExecutionAuthorityService({
    audit,
    clock,
    projectBindings: projectBindingReader(tempRoot),
    realExecutionEnabled: () => realExecutionEnabled,
    secret: 'a'.repeat(32),
    ttlMs: 60_000,
  })
}

function fixedClock(): Date {
  return new Date('2026-07-22T03:00:00.000Z')
}

function task(): AxisTask {
  return { assignedFiles: [filePath], dependencies: [], estimatedComplexity: 1, id: 'inspect', objective: 'Inspect', requiredGates: ['compile', 'test'], requiresHumanReview: false, requiredTools: ['fs.safeWrite'], spawnDepth: 1, title: 'Inspect' }
}

function issueRequest() {
  return {
    checkpointReceipts: [{ checkpointId: 'checkpoint-1', filePath, priorState: 'existing-file' as const, rollbackAction: 'restore-checkpoint' as const }],
    grantedFilePaths: [filePath], grantedTools: ['fs.safeWrite'], projectRoot: tempRoot,
    runId: 'run-1', sessionId: 'session-1', task: task(),
  }
}

function safeWriteEvidence() {
  const capturedAt = '2026-07-22T03:00:00.000Z'
  const expiresAt = '2026-07-22T03:05:00.000Z'
  return {
    fileFingerprintEvidence: [{
      capturedAt,
      evidenceId: 'fingerprint-1',
      expiresAt,
      fileKey: 'a'.repeat(64),
      projectId: 'project-1',
      projectRelativePath: 'source.ts',
      proof: 'p'.repeat(43),
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      state: {
        byteLength: 6,
        contentSha256: sha256('before'),
        fileInstanceSha256: 'b'.repeat(64),
        kind: 'exists' as const,
      },
      taskId: 'inspect',
    }],
    fileLeaseEvidence: [{
      acquiredAt: capturedAt,
      expiresAt,
      fileKey: 'a'.repeat(64),
      leaseId: 'lease-1',
      projectId: 'project-1',
      projectRelativePath: 'source.ts',
      runId: 'run-1',
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      status: 'active' as const,
      taskId: 'inspect',
      updatedAt: capturedAt,
      version: 1,
    }],
  }
}

function expectedBinding() {
  return { projectRoot: tempRoot, runId: 'run-1', sessionId: 'session-1', taskId: 'inspect' }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
