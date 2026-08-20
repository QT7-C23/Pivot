import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot replan task scheduling boundaries', () => {
  it('keeps shared contracts infrastructure-free and the scheduler on narrow Ports', async () => {
    const shared = await readFile(
      'src/shared/axis-pivot-replan-task-scheduling-contracts.ts',
      'utf8',
    )
    const ports = await readFile(
      'src/main/services/axis-pivot-replan-task-scheduling-ports.ts',
      'utf8',
    )
    const scheduler = await readFile(
      'src/main/services/axis-pivot-replan-task-scheduler.ts',
      'utf8',
    )
    const root = await readFile('src/main/ipc-handlers.ts', 'utf8')

    expect(shared).not.toMatch(/src\/main|src\/renderer|better-sqlite3|node:fs/)
    expect(ports).not.toMatch(/Registry|better-sqlite3|node:fs|Renderer/)
    expect(scheduler).toContain('AxisPivotReplanTaskSchedulePort')
    expect(scheduler).not.toMatch(/Registry|better-sqlite3|node:fs|Renderer|Worker/)
    expect(root).toContain('createAxisPivotReplanTaskSchedulingRuntime')
    expect(root).toMatch(/ownedData:\s*\[[\s\S]*axisPivotReplanTaskScheduling/)
    expect(root).toMatch(/resources:\s*\[[\s\S]*axisPivotReplanTaskScheduling/)
  })
})
