import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (filePath: string): string => readFileSync(path.resolve(filePath), 'utf8')

describe('Renderer file mutation capability boundaries', () => {
  it('does not expose the legacy arbitrary-content safe-write bypass to Renderer IPC', () => {
    const ipcContract = source('src/shared/types/ipc.ts')
    const validation = source('src/shared/ipc-validation.ts')
    const handlers = source('src/main/ipc-handlers.ts')
    const rendererFiles = source('src/renderer/services/file.service.ts')

    for (const candidate of [ipcContract, validation, handlers, rendererFiles]) {
      expect(candidate).not.toContain('fs:safe-write')
    }
    expect(rendererFiles).not.toContain('FileSafeWriteResult')
    expect(handlers).not.toContain('SafeFileWriter')
  })

  it('retains only explicit user file-management and Axis reviewed-write channels', () => {
    const ipcContract = source('src/shared/types/ipc.ts')

    for (const channel of [
      'fs:create-file',
      'fs:create-directory',
      'fs:restore-checkpoint',
      'fs:resolve-review',
      'axis:propose-guarded-safe-write',
      'axis:execute-guarded-safe-write',
    ]) {
      expect(ipcContract).toContain(`'${channel}'`)
    }
  })
})
