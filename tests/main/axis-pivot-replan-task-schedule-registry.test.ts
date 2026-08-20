import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisPivotReplanTaskScheduleRegistry } from '../../src/main/services/axis-pivot-replan-task-schedule-registry'
import { scheduledTaskEvidence } from '../fixtures/axis-pivot-replan-task-scheduling'

describe('AxisPivotReplanTaskScheduleRegistry', () => {
  it('persists one immutable schedule per decision and child-state revision across restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-schedule-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const registry = new AxisPivotReplanTaskScheduleRegistry(databasePath, {
        clock: () => new Date('2026-08-02T01:00:00.000Z'),
        idFactory: () => 'replan-schedule-1',
      })
      const first = registry.create(createInput())
      expect(first).toEqual({ created: true, schedule: scheduledTaskEvidence() })
      expect(registry.create(createInput())).toEqual({
        created: false,
        schedule: first.schedule,
      })
      registry.close()

      const reopened = new AxisPivotReplanTaskScheduleRegistry(databasePath)
      expect(reopened.findBySource('decision-replan-1', 1)).toEqual(first.schedule)
      const next = reopened.create({
        ...createInput(),
        childStateRevision: 4,
        dependencyTaskIds: ['child-task-1'],
        taskId: 'child-task-2',
      })
      expect(next).toMatchObject({
        created: true,
        schedule: { childStateRevision: 4, taskId: 'child-task-2' },
      })
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('rejects conflicting creator ownership for the same source revision', () => {
    const registry = new AxisPivotReplanTaskScheduleRegistry(':memory:', {
      idFactory: () => 'replan-schedule-1',
    })
    registry.create(createInput())
    expect(() => registry.create({
      ...createInput(),
      taskId: 'other-task',
    })).toThrow(/ownership/i)
    registry.close()
  })
})

function createInput() {
  const {
    authority: _authority,
    createdAt: _createdAt,
    scheduleId: _scheduleId,
    schemaVersion: _schemaVersion,
    status: _status,
    ...input
  } = scheduledTaskEvidence()
  return input
}
