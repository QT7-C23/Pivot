import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot replan Run driver boundaries', () => {
  it('keeps shared contracts infrastructure-free and composes only narrow Ports in Main', async () => {
    const [contracts, driver, root, orchestration] = await Promise.all([
      readFile('src/shared/axis-pivot-replan-run-driver-contracts.ts', 'utf8'),
      readFile('src/main/services/axis-pivot-replan-run-driver.ts', 'utf8'),
      readFile('src/main/ipc-handlers.ts', 'utf8'),
      readFile('src/main/axis-dry-run-ipc-orchestrator.ts', 'utf8'),
    ])
    expect(contracts).not.toMatch(/better-sqlite3|node:fs|src\/main|\.\.\/main/)
    expect(driver).toContain('AxisPivotReplanTaskSchedulerPort')
    expect(driver).toContain('AxisPivotReplanReviewedTaskOrchestratorPort')
    expect(driver).not.toMatch(/Registry|better-sqlite3|node:fs/)
    expect(root).toContain('createAxisPivotReplanRunDriveRuntime')
    expect(root).toContain('replanDriver: axisPivotReplanRunDriver')
    expect(orchestration).toContain('replanDriver?.drive')
    expect(root).toMatch(/ownedData:\s*\[[\s\S]*axisPivotReplanRunDriver/)
    expect(root).toMatch(/resources:\s*\[[\s\S]*axisPivotReplanRunDriver/)
  })
})
