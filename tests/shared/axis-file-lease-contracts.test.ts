import { describe, expect, it } from 'vitest'
import {
  AxisFileLeaseAcquireRequestSchema,
  AxisFileLeaseBatchAcquireRequestSchema,
  AxisFileLeaseBatchReleaseRequestSchema,
  AxisFileLeaseBatchVerifyRequestSchema,
  AxisFileLeaseSchema,
} from '../../src/shared/axis-file-lease-contracts'

describe('Axis file lease contracts', () => {
  it('accepts a bounded active lease with explicit ownership and version', () => {
    expect(AxisFileLeaseSchema.parse(validLease())).toMatchObject({
      projectId: 'project-1',
      status: 'active',
      taskId: 'task-1',
      version: 1,
    })
  })

  it('rejects invalid time ordering and unknown ownership fields in task requests', () => {
    expect(() => AxisFileLeaseSchema.parse({
      ...validLease(),
      expiresAt: '2026-07-26T23:59:59.999Z',
    })).toThrow(/after/i)

    expect(() => AxisFileLeaseAcquireRequestSchema.parse({
      filePath: 'src/app.ts',
      ownerTaskId: 'task-other',
      ttlMs: 60_000,
    })).toThrow()
  })

  it('bounds lease duration requests', () => {
    expect(() => AxisFileLeaseAcquireRequestSchema.parse({
      filePath: 'src/app.ts',
      ttlMs: 0,
    })).toThrow()
    expect(() => AxisFileLeaseAcquireRequestSchema.parse({
      filePath: 'src/app.ts',
      ttlMs: 10 * 60_000,
    })).toThrow()
  })

  it('requires a bounded non-empty file set and unique lease mutations', () => {
    expect(AxisFileLeaseBatchAcquireRequestSchema.parse({
      filePaths: ['src/app.ts', './src/app.ts'],
      ttlMs: 60_000,
    })).toMatchObject({ filePaths: ['src/app.ts', './src/app.ts'] })

    expect(() => AxisFileLeaseBatchAcquireRequestSchema.parse({
      filePaths: [],
      ttlMs: 60_000,
    })).toThrow()
    expect(() => AxisFileLeaseBatchAcquireRequestSchema.parse({
      filePaths: Array.from({ length: 129 }, (_, index) => `src/${index}.ts`),
      ttlMs: 60_000,
    })).toThrow()
    expect(() => AxisFileLeaseBatchReleaseRequestSchema.parse({
      leases: [
        { expectedVersion: 1, leaseId: 'lease-1' },
        { expectedVersion: 2, leaseId: 'lease-1' },
      ],
    })).toThrow(/duplicate/i)
    expect(() => AxisFileLeaseBatchVerifyRequestSchema.parse({
      leases: [
        { expectedVersion: 1, leaseId: 'lease-1' },
        { expectedVersion: 1, leaseId: 'lease-1' },
      ],
    })).toThrow(/duplicate/i)
  })
})

function validLease() {
  return {
    acquiredAt: '2026-07-27T00:00:00.000Z',
    expiresAt: '2026-07-27T00:01:00.000Z',
    fileKey: 'a'.repeat(64),
    leaseId: 'lease-1',
    projectId: 'project-1',
    projectRelativePath: 'src/app.ts',
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    status: 'active' as const,
    taskId: 'task-1',
    updatedAt: '2026-07-27T00:00:00.000Z',
    version: 1,
  }
}
