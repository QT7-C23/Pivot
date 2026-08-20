import { access, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAxisPivotReplanTaskSchedulingRuntime } from '../../src/main/services/axis-pivot-replan-task-scheduling-runtime'
import {
  replanAuthorization,
  replanChildPlan,
  replanChildState,
} from '../fixtures/axis-pivot-replan-task-scheduling'

describe('Axis Pivot replan task scheduling runtime', () => {
  it('constructs no durable resource unless every narrow Port is available', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-scheduling-off-'))
    const databasePath = path.join(directory, 'pivot.db')
    const ports = fixturePorts()
    try {
      expect(createAxisPivotReplanTaskSchedulingRuntime({
        ...ports,
        authorization: null,
        databasePath,
      })).toBeNull()
      expect(createAxisPivotReplanTaskSchedulingRuntime({
        ...ports,
        databasePath,
        plans: null,
      })).toBeNull()
      expect(createAxisPivotReplanTaskSchedulingRuntime({
        ...ports,
        databasePath,
        states: null,
      })).toBeNull()
      await expect(access(databasePath)).rejects.toThrow()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('persists schedules, supports Session cleanup and closes idempotently', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-scheduling-on-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const runtime = createAxisPivotReplanTaskSchedulingRuntime({
        ...fixturePorts(),
        databasePath,
      })
      if (!runtime) throw new Error('Expected replan task scheduling runtime')
      await runtime.ready
      const schedule = runtime.schedule({ decisionId: 'decision-replan-1' })
      expect(runtime.find('decision-replan-1', 1)).toEqual(schedule)
      const reader = runtime.openReaderPort()
      expect(Object.isFrozen(reader)).toBe(true)
      expect(reader.find(schedule.scheduleId)).toEqual(schedule)
      runtime.deleteForSession('session-1')
      expect(runtime.find('decision-replan-1', 1)).toBeNull()
      expect(reader.find(schedule.scheduleId)).toBeNull()
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
    plans: { find: () => replanChildPlan() },
    states: { find: () => replanChildState() },
  }
}
