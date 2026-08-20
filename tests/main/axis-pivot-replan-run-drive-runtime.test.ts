import { access, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAxisPivotReplanRunDriveRuntime } from '../../src/main/services/axis-pivot-replan-run-drive-runtime'
import {
  replanChildContinuationAttempt,
  replanChildProposalResult,
  replanReviewedTaskPreparing,
} from '../fixtures/axis-pivot-replan-reviewed-task'
import { scheduledTaskEvidence } from '../fixtures/axis-pivot-replan-task-scheduling'

describe('Axis Pivot replan Run drive runtime', () => {
  it('constructs no database unless both narrow Ports exist', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-drive-off-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const ports = fixturePorts()
      expect(createAxisPivotReplanRunDriveRuntime({ ...ports, databasePath, scheduler: null })).toBeNull()
      expect(createAxisPivotReplanRunDriveRuntime({ ...ports, databasePath, reviewedTasks: null })).toBeNull()
      await expect(access(databasePath)).rejects.toThrow()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('persists failed drive results, cleans Session and closes idempotently', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-drive-on-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const runtime = createAxisPivotReplanRunDriveRuntime({ ...fixturePorts(), databasePath })
      if (!runtime) throw new Error('Expected replan Run drive runtime')
      await runtime.ready
      const result = await runtime.drive({ decisionId: 'decision-replan-1' })
      expect(result).toMatchObject({ status: 'failed' })
      expect(runtime.find('decision-replan-1')).toEqual(result)
      runtime.deleteForSession('session-1')
      expect(runtime.find('decision-replan-1')).toBeNull()
      runtime.close()
      runtime.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function fixturePorts() {
  const schedule = scheduledTaskEvidence()
  return {
    reviewedTasks: { orchestrate: async () => ({
      ...replanReviewedTaskPreparing(),
      continuationAttempt: replanChildContinuationAttempt(),
      proposalResult: replanChildProposalResult(), revision: 3,
      status: 'completed' as const, updatedAt: '2026-08-02T01:00:03.000Z',
    }) },
    scheduler: { schedule: () => schedule },
  }
}
