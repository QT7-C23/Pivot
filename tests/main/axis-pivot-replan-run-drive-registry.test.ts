import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisPivotReplanRunDriveRegistry } from '../../src/main/services/axis-pivot-replan-run-drive-registry'

describe('Axis Pivot replan Run drive Registry', () => {
  it('persists one immutable terminal result across restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-replan-drive-registry-'))
    const databasePath = path.join(directory, 'pivot.db')
    try {
      const first = new AxisPivotReplanRunDriveRegistry(databasePath)
      expect(first.save(result())).toEqual(result())
      expect(first.save(result())).toEqual(result())
      first.close()
      const reopened = new AxisPivotReplanRunDriveRegistry(databasePath)
      expect(reopened.find('decision-1')).toEqual(result())
      expect(() => reopened.save({ ...result(), finalStateRevision: 8 })).toThrow(/conflict/i)
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('deletes only the owned Session projection', () => {
    const registry = new AxisPivotReplanRunDriveRegistry()
    registry.save(result())
    registry.deleteForSession('other-session')
    expect(registry.find('decision-1')).toEqual(result())
    registry.deleteForSession('session-1')
    expect(registry.find('decision-1')).toBeNull()
    registry.close()
  })
})

function result() {
  return {
    action: 'replan' as const, authority: 'pivot-main-replan-run-driver' as const,
    childRunId: 'child-1', completedTaskIds: ['task-1'], decisionId: 'decision-1',
    failureReason: null, finalStateRevision: 7,
    orchestrationIds: ['orchestration-1'], parentRunId: 'parent-1',
    scheduleIds: ['schedule-1'], schemaVersion: 1 as const,
    sessionId: 'session-1', status: 'completed' as const,
  }
}
