import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis production guarded runtime boundaries', () => {
  it('keeps concrete composition in Main and exposes only a narrow guarded-write IPC', async () => {
    const runtime = await source('main/services/axis-production-guarded-runtime.ts')
    const guardedWrite = await source('main/services/axis-guarded-safe-write.ts')
    const submission = await source('main/services/axis-guarded-safe-write-submission.ts')
    const worker = await source('main/services/axis-safe-write-worker.ts')
    const ipcComposition = await source('main/services/axis-guarded-ipc-runtime.ts')
    const ipcHandlers = await source('main/ipc-handlers.ts')
    const windowsGate = await source('main/services/axis-windows-npm-gate-adapter.ts')
    const ipcContract = await source('shared/types/ipc.ts')

    expect(runtime).toContain('new AxisGuardedSafeWriteHarness')
    expect(runtime).toContain('new SqliteAxisBlackboardStore')
    expect(runtime).toContain('new AxisExecutionTransactionJournal')
    expect(runtime).toContain('new AxisExecutionRecoveryCoordinator')
    expect(runtime).not.toMatch(/ipcMain|BrowserWindow|renderer\//)
    expect(guardedWrite).toContain('AxisGuardedSafeWriteEvidencePort')
    expect(worker).not.toMatch(/BlackboardAdmin|SqliteAxisBlackboardStore|better-sqlite3/)
    expect(submission).toContain('AxisGuardedSafeWriteExecutionPort')
    expect(submission).toContain('AxisGuardedRunStatePort')
    expect(submission).toContain('AxisGuardedTaskReaderPort')
    expect(submission).toContain('AxisProjectBindingReaderPort')
    expect(submission).not.toMatch(/AxisRunStateRegistry|AxisShadowRunRegistry|SessionRegistry|Sqlite|better-sqlite3|node:fs|renderer\//)

    expect(ipcComposition).toContain('createAxisProductionGuardedRuntime')
    expect(ipcComposition).toContain('resolveAxisRealExecutionFeature')
    expect(ipcComposition).toContain('AxisGuardedSafeWriteSubmissionService')
    expect(ipcComposition).not.toMatch(/ipcMain|BrowserWindow|renderer\//)
    expect(ipcHandlers).toContain('createAxisGuardedIpcRuntime')
    expect(ipcHandlers).toContain('createAxisReviewerSettingsRuntime')
    expect(ipcHandlers).toContain('axisReviewerSettings.semanticReview')
    expect(ipcHandlers).not.toContain('createAxisSemanticReviewProductionRuntimeFromStore')
    expect(ipcHandlers).not.toMatch(/createAxisProductionGuardedRuntime|resolveAxisRealExecutionFeature|AxisGuardedSafeWriteSubmissionService/)
    expect(ipcHandlers).toContain('AxisGuardedIpcInfrastructure')
    expect(ipcHandlers).toContain('AxisGateCommandRunPort')
    expect(ipcHandlers).toContain('new AxisWindowsNpmGateCommandAdapter')
    expect(ipcHandlers).toContain('AxisLeaseLifecyclePort')
    expect(windowsGate).toContain('implements AxisGateCommandRunPort')
    expect(windowsGate).not.toMatch(/node:child_process|shell:\s*true|renderer\//)
    expect(ipcHandlers).toMatch(/handle\(['"]axis:execute-guarded-safe-write/)
    expect(ipcContract).toContain("'axis:execute-guarded-safe-write'")
    const guardedIpc = ipcContract.match(
      /'axis:execute-guarded-safe-write':\s*{\s*request:\s*AxisGuardedSafeWriteSubmission\s*response:\s*AxisGuardedSafeWriteSubmissionResult\s*}/,
    )?.[0] ?? ''
    expect(guardedIpc).not.toBe('')
    expect(guardedIpc).not.toMatch(/projectRoot|AxisTask|grantedTools|authority|proof/)
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
