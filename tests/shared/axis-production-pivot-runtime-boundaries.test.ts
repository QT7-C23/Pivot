import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis production Dynamic Pivot runtime boundaries', () => {
  it('is application-root owned without adding IPC, Renderer, or Worker execution reachability', async () => {
    const root = await readFile(path.resolve(
      'src/main/ipc-handlers.ts',
    ), 'utf8')
    const runtime = await readFile(path.resolve(
      'src/main/services/axis-production-pivot-runtime.ts',
    ), 'utf8')

    expect(root).toContain('createAxisProductionPivotRuntime')
    expect(root).toContain('resolveAxisDynamicPivotFeature')
    expect(root).toContain('axisPivot?.ready')
    expect(root).toMatch(/ownedData:\s*\[[\s\S]*axisPivot/)
    expect(root).toMatch(/resources:\s*\[[\s\S]*axisPivot/)
    expect(root).not.toMatch(/handle\(['"]axis:[^'"]*pivot/i)

    expect(runtime).not.toMatch(/ipcMain|BrowserWindow|preload|renderer/)
    expect(runtime).not.toMatch(/AxisSafeWriteWorker|ExecutionAuthority|CommandRunner/)
    expect(runtime).toContain('PIVOT_AXIS_DYNAMIC_PIVOT')
    expect(runtime).toContain('if (!options.feature.isEnabled()) return null')
  })
})
