import { access, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAxisPivotReplanReviewedTaskRuntime } from '../../src/main/services/axis-pivot-replan-reviewed-task-runtime'
import { replanAuthorization, scheduledTaskEvidence } from '../fixtures/axis-pivot-replan-task-scheduling'
import {
  replanChildContinuationAttempt,
  replanChildProposalResult,
} from '../fixtures/axis-pivot-replan-reviewed-task'

describe('Axis Pivot replan reviewed-task runtime', () => {
  it('constructs no durable resource unless every narrow Port is available', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-reviewed-off-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const ports = fixturePorts()
      expect(createAxisPivotReplanReviewedTaskRuntime({
        ...ports, authorization: null, databasePath,
      })).toBeNull()
      expect(createAxisPivotReplanReviewedTaskRuntime({
        ...ports, continuations: null, databasePath,
      })).toBeNull()
      expect(createAxisPivotReplanReviewedTaskRuntime({
        ...ports, databasePath, proposals: null,
      })).toBeNull()
      expect(createAxisPivotReplanReviewedTaskRuntime({
        ...ports, databasePath, schedules: null,
      })).toBeNull()
      await expect(access(databasePath)).rejects.toThrow()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('orchestrates once, cleans by Session and closes idempotently', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-reviewed-on-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const runtime = createAxisPivotReplanReviewedTaskRuntime({
        ...fixturePorts(), databasePath,
      })
      if (!runtime) throw new Error('Expected replan reviewed-task runtime')
      await runtime.ready
      const result = await runtime.orchestrate({ scheduleId: 'replan-schedule-1' })
      expect(runtime.find('replan-schedule-1')).toEqual(result)
      runtime.deleteForSession('session-1')
      expect(runtime.find('replan-schedule-1')).toBeNull()
      runtime.close()
      runtime.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function fixturePorts() {
  return {
    authorization: { find: () => replanAuthorization() },
    continuations: { consume: async () => replanChildContinuationAttempt() },
    proposals: { propose: async () => replanChildProposalResult() },
    schedules: { find: () => scheduledTaskEvidence() },
  }
}
