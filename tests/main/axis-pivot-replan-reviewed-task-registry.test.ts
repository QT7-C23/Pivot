import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisPivotReplanReviewedTaskRegistry } from '../../src/main/services/axis-pivot-replan-reviewed-task-registry'
import {
  replanChildProposalResult,
  replanReviewedTaskBeginInput,
} from '../fixtures/axis-pivot-replan-reviewed-task'

describe('AxisPivotReplanReviewedTaskRegistry', () => {
  it('persists per-schedule ownership and recovers interrupted work without replay', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-reviewed-task-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = createRegistry(databasePath)
      const first = registry.begin(replanReviewedTaskBeginInput())
      expect(first.created).toBe(true)
      expect(registry.begin(replanReviewedTaskBeginInput())).toEqual({
        created: false,
        orchestration: first.orchestration,
      })
      registry.markSubmitting({
        expectedRevision: first.orchestration.revision,
        orchestrationId: first.orchestration.orchestrationId,
        proposalResult: replanChildProposalResult(),
      })
      registry.close()

      const reopened = new AxisPivotReplanReviewedTaskRegistry(databasePath)
      expect(reopened.recoverInterrupted()).toEqual([
        expect.objectContaining({
          error: expect.stringMatching(/manual reconciliation/i),
          revision: 3,
          scheduleId: 'replan-schedule-1',
          status: 'recovery-required',
        }),
      ])
      expect(reopened.recoverInterrupted()).toEqual([])
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('rejects conflicting ownership for the same schedule', () => {
    const registry = createRegistry(':memory:')
    registry.begin(replanReviewedTaskBeginInput())
    expect(() => registry.begin({
      ...replanReviewedTaskBeginInput(),
      submittedTaskId: 'forged-task',
    })).toThrow(/ownership/i)
    registry.close()
  })
})

function createRegistry(databasePath: string) {
  return new AxisPivotReplanReviewedTaskRegistry(databasePath, {
    clock: () => new Date('2026-08-02T01:00:00.000Z'),
    idFactory: () => 'replan-reviewed-task-1',
  })
}
