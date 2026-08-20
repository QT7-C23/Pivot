import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis production lifecycle module boundaries', () => {
  it('keeps orchestration on narrow Ports and concrete adapters in the Main composition root', async () => {
    const mainLifecycle = await source('main/services/axis-main-lifecycle.ts')
    const runLifecycle = await source('main/services/axis-lease-aware-run-state.ts')
    const guardedIpcRuntime = await source('main/services/axis-guarded-ipc-runtime.ts')
    const ipcHandlers = await source('main/ipc-handlers.ts')
    const main = await source('main/main.ts')

    expect(mainLifecycle).toContain('AxisProjectBindingAdminPort')
    expect(mainLifecycle).toContain('AxisLeaseLifecyclePort')
    expect(mainLifecycle).not.toMatch(/SqliteAxis|better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(runLifecycle).toContain('AxisDryRunStateStore')
    expect(runLifecycle).toContain('AxisLeaseLifecyclePort')
    expect(runLifecycle).not.toMatch(/SqliteAxis|better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)

    expect(ipcHandlers).toContain('new SqliteAxisProjectBindingStore')
    expect(ipcHandlers).toContain('new SqliteAxisFileLeaseStore')
    expect(ipcHandlers).toContain('new AxisRunLeaseLifecycleCoordinator')
    expect(ipcHandlers).toContain('new AxisMainLifecycleCoordinator')
    expect(ipcHandlers).toContain('new AxisLeaseAwareRunStateStore')
    expect(ipcHandlers).toMatch(/states:\s*leaseAwareRunStates/)
    expect(ipcHandlers).toMatch(/leaseAwareRunStates\.cancel\(request\)/)
    expect(guardedIpcRuntime).toContain('AxisGuardedSafeWriteSubmissionService')
    expect(ipcHandlers).toContain('createAxisGuardedIpcRuntime')

    expect(main).toContain('await startup.runtime.ready')
    expect(main).toContain('await ipcRuntime?.close()')
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
