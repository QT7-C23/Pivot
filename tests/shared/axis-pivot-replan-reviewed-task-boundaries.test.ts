import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot replan reviewed-task boundaries', () => {
  it('keeps contracts infrastructure-free and composes only in Main', async () => {
    const [contracts, orchestrator, root, deletion, shutdown] = await Promise.all([
      readFile('src/shared/axis-pivot-replan-reviewed-task-contracts.ts', 'utf8'),
      readFile('src/main/services/axis-pivot-replan-reviewed-task-orchestrator.ts', 'utf8'),
      readFile('src/main/ipc-handlers.ts', 'utf8'),
      readFile('src/main/session-permanent-deletion.ts', 'utf8'),
      readFile('src/main/ipc-runtime-shutdown.ts', 'utf8'),
    ])
    expect(contracts).not.toMatch(/better-sqlite3|node:fs|src\/main|\.\.\/main/)
    expect(orchestrator).toContain('AxisPivotReplanTaskScheduleReaderPort')
    expect(orchestrator).not.toMatch(/Registry|better-sqlite3|node:fs/)
    expect(root).toContain('createAxisPivotReplanReviewedTaskRuntime')
    expect(root).toMatch(/ownedData:\s*\[[\s\S]*axisPivotReplanReviewedTasks/)
    expect(root).toMatch(/resources:\s*\[[\s\S]*axisPivotReplanReviewedTasks/)
    expect(deletion).toContain('store.deleteForSession(sessionId)')
    expect(shutdown).toContain('resource?.close()')
  })
})
