import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis safe-write proposal boundaries', () => {
  it('keeps model output review-only and concrete filesystem/model adapters in Main', async () => {
    const contract = await source('shared/axis-safe-write-proposal-contracts.ts')
    const ports = await source('main/services/axis-safe-write-proposal-ports.ts')
    const service = await source('main/services/axis-safe-write-proposal.ts')
    const model = await source('main/services/ai-sdk-axis-safe-write-proposal-model.ts')
    const rendererService = await source('renderer/services/axis-shadow.service.ts')
    const rendererStore = await source('renderer/stores/axis-shadow.store.ts')

    expect(contract).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(ports).toContain('AxisSafeWriteProposalModelPort')
    expect(ports).toContain('AxisSafeWriteProposalFileReaderPort')
    expect(ports).toContain('AxisSafeWriteProposalRunStatePort')
    expect(ports).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(service).toContain('AxisSafeWriteProposalRequestSchema.parse')
    expect(service).toContain('AxisSafeWriteProposalModelOutputSchema.parse')
    expect(service).not.toMatch(/PermissionManager|AxisExecutionAuthority|AxisFileLeaseAdminPort|writeFile|unlink|CommandRunner|ipcMain|BrowserWindow|renderer\//)
    expect(model).toMatch(/proposal only/i)
    expect(model).toMatch(/Never execute tools/i)
    expect(rendererService).toContain("'axis:propose-guarded-safe-write'")
    expect(`${rendererService}\n${rendererStore}`).not.toMatch(/better-sqlite3|node:fs|AxisExecutionAuthority|AxisFileLeaseAdminPort|PermissionManager/)
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
