import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis reviewed proposal receipt boundaries', () => {
  it('keeps the strict receipt contract shared and signing, fingerprints, and verification in Main', async () => {
    const contract = await source('shared/axis-reviewed-proposal-contracts.ts')
    const ports = await source('main/services/axis-reviewed-proposal-ports.ts')
    const receipt = await source('main/services/axis-reviewed-proposal-receipt.ts')
    const submission = await source('main/services/axis-guarded-safe-write-submission.ts')
    const harness = await source('main/services/axis-guarded-safe-write.ts')
    const composition = await source('main/services/axis-guarded-ipc-runtime.ts')
    const ipcHandlers = await source('main/ipc-handlers.ts')
    const rendererService = await source('renderer/services/axis-shadow.service.ts')
    const rendererStore = await source('renderer/stores/axis-shadow.store.ts')

    expect(contract).toContain('.strict()')
    expect(contract).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(ports).toContain('AxisReviewedProposalReceiptIssuerPort')
    expect(ports).toContain('AxisReviewedProposalReceiptVerifierPort')
    expect(ports).not.toMatch(/better-sqlite3|node:fs|ipcMain|BrowserWindow|renderer\//)
    expect(receipt).toContain("createHmac('sha256'")
    expect(receipt).toContain('timingSafeEqual')
    expect(receipt).toContain('AxisReviewedSafeWriteReceiptSchema.parse')

    expect(submission).toContain('AxisReviewedProposalReceiptVerifierPort')
    expect(submission).toContain('reviewedProposals.verify')
    expect(submission).toContain('runStates.claimTask')
    expect(submission.indexOf('reviewedProposals.verify')).toBeLessThan(
      submission.indexOf('runStates.claimTask'),
    )
    expect(harness).toContain('assertReviewedProposalFingerprintBaseline')
    expect(harness).toContain('checkpointIssuer.issue')
    expect(harness.indexOf('assertReviewedProposalFingerprintBaseline')).toBeLessThan(
      harness.indexOf('checkpointIssuer.issue'),
    )

    expect(composition).toContain('new AxisReviewedProposalReceiptService')
    expect(composition).toContain('new AxisExternalFileFingerprintAdapter')
    expect(ipcHandlers).not.toMatch(
      /new AxisReviewedProposalReceiptService|new AxisExternalFileFingerprintAdapter/,
    )
    expect(`${rendererService}\n${rendererStore}`).not.toMatch(
      /createHmac|timingSafeEqual|proofSecret|AxisFileFingerprintPort|better-sqlite3|node:fs|AdminPort/,
    )
  })
})

function source(relativePath: string): Promise<string> {
  return readFile(path.resolve('src', relativePath), 'utf8')
}
