import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot guarded continuation boundaries', () => {
  it('keeps review consumption Main-owned, Port-driven, and separate from Renderer authority', async () => {
    const [contracts, ports, consumer, runtime, root] = await Promise.all([
      read('src/shared/axis-pivot-guarded-continuation-contracts.ts'),
      read('src/main/services/axis-pivot-guarded-continuation-ports.ts'),
      read('src/main/services/axis-pivot-guarded-continuation-consumer.ts'),
      read('src/main/services/axis-pivot-guarded-continuation-runtime.ts'),
      read('src/main/ipc-handlers.ts'),
    ])

    expect(contracts).not.toMatch(/src\/main|electron|better-sqlite3/i)
    expect(contracts).not.toMatch(/projectRoot|authority|command|proof|secret/i)
    expect(ports).not.toMatch(/Registry|better-sqlite3|file-system|Renderer/i)
    expect(consumer).not.toMatch(/better-sqlite3|file-system|electron|ipcMain/i)
    expect(runtime).not.toMatch(/Renderer|ipcMain|file-system|PermissionManager/i)
    expect(root).toContain('createAxisPivotGuardedContinuationRuntime')
    expect(root).toContain('axisPivot?.openContinuationAuthorizationPort()')
    expect(root).toContain('axisGuarded.openSubmissionPort()')
    expect(root).not.toMatch(/handle\(['"]axis:[^'"]*pivot/i)
  })
})

function read(filePath: string): Promise<string> {
  return readFile(path.resolve(filePath), 'utf8')
}
