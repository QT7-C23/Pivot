import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot reviewed continuation boundaries', () => {
  it('keeps automatic proposal orchestration Main-owned and Port-only', async () => {
    const [contracts, ports, orchestrator, runtime, root] = await Promise.all([
      read('src/shared/axis-pivot-reviewed-continuation-contracts.ts'),
      read('src/main/services/axis-pivot-reviewed-continuation-ports.ts'),
      read('src/main/services/axis-pivot-reviewed-continuation-orchestrator.ts'),
      read('src/main/services/axis-pivot-reviewed-continuation-runtime.ts'),
      read('src/main/ipc-handlers.ts'),
    ])

    expect(contracts).not.toMatch(/src\/main|electron|better-sqlite3/i)
    expect(contracts).not.toMatch(/projectRoot|authority|command|proof|secret/i)
    expect(ports).not.toMatch(/Registry|better-sqlite3|file-system|Renderer/i)
    expect(orchestrator).not.toMatch(/better-sqlite3|file-system|electron|ipcMain/i)
    expect(runtime).not.toMatch(/Renderer|ipcMain|file-system|PermissionManager/i)
    expect(root).toContain('createAxisPivotReviewedContinuationRuntime')
    expect(root).not.toMatch(/handle\(['"]axis:[^'"]*pivot-reviewed/i)
  })
})

function read(filePath: string): Promise<string> {
  return readFile(path.resolve(filePath), 'utf8')
}
