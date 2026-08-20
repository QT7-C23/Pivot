import { describe, expect, it } from 'vitest'
import {
  AxisLeaseCleanupReceiptSchema,
  AxisLeaseCleanupRequestSchema,
  AxisProjectBindingSchema,
  AxisProjectBindRequestSchema,
} from '../../src/shared/axis-project-binding-contracts'

describe('Axis project binding contracts', () => {
  it('accepts a strict persisted project binding', () => {
    expect(AxisProjectBindingSchema.parse({
      boundAt: '2026-07-28T15:00:00.000Z',
      projectId: 'axis-project-1',
      projectRoot: 'D:\\Project\\Tiny Agent Code',
      schemaVersion: 1,
      sessionId: 'session-1',
    })).toMatchObject({
      projectId: 'axis-project-1',
      schemaVersion: 1,
      sessionId: 'session-1',
    })
  })

  it('rejects malformed bindings and unknown fields', () => {
    expect(() => AxisProjectBindingSchema.parse({
      boundAt: 'not-a-date',
      projectId: '',
      projectRoot: '',
      schemaVersion: 1,
      sessionId: 'session-1',
    })).toThrow()
    expect(() => AxisProjectBindRequestSchema.parse({
      projectRoot: 'D:\\Project',
      sessionId: 'session-1',
      writerSelectedProjectId: 'forged',
    })).toThrow()
  })

  it('keeps run and session cleanup requests scope-specific', () => {
    expect(AxisLeaseCleanupRequestSchema.parse({
      reason: 'completed',
      runId: 'run-1',
      scope: 'run',
      sessionId: 'session-1',
    })).toMatchObject({ scope: 'run' })
    expect(AxisLeaseCleanupRequestSchema.parse({
      reason: 'session-closed',
      scope: 'session',
      sessionId: 'session-1',
    })).toMatchObject({ scope: 'session' })
    expect(() => AxisLeaseCleanupRequestSchema.parse({
      reason: 'session-closed',
      runId: 'run-1',
      scope: 'run',
      sessionId: 'session-1',
    })).toThrow()
  })

  it('requires cleanup receipts to preserve scope and ownership', () => {
    expect(AxisLeaseCleanupReceiptSchema.parse({
      cleanedAt: '2026-07-28T15:01:00.000Z',
      reason: 'cancelled',
      releasedLeaseCount: 2,
      runId: 'run-1',
      schemaVersion: 1,
      scope: 'run',
      sessionId: 'session-1',
    })).toMatchObject({ releasedLeaseCount: 2 })
    expect(() => AxisLeaseCleanupReceiptSchema.parse({
      cleanedAt: '2026-07-28T15:01:00.000Z',
      reason: 'session-closed',
      releasedLeaseCount: 1,
      runId: 'run-1',
      schemaVersion: 1,
      scope: 'session',
      sessionId: 'session-1',
    })).toThrow()
  })
})
