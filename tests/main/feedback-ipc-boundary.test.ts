import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('feedback Main composition boundary', () => {
  it('constructs the Adapter only in Main and closes it with the runtime', () => {
    const handlers = readFileSync(path.resolve('src/main/ipc-handlers.ts'), 'utf8')
    const preload = readFileSync(path.resolve('src/main/preload.ts'), 'utf8')
    const shutdown = readFileSync(path.resolve('src/main/ipc-runtime-shutdown.ts'), 'utf8')
    expect(handlers).toContain('new SqliteFeedbackAdapter')
    expect(handlers).toContain('feedback.openReaderPort()')
    expect(handlers).toContain('feedback.openWriterPort()')
    expect(handlers).toContain('feedback.openAttachmentStagingPort()')
    expect(handlers).toContain('feedback.openAttachmentDiscardPort()')
    expect(handlers).toMatch(/resources:\s*\[[\s\S]*feedback/)
    expect(shutdown).toContain('resource?.close()')
    expect(preload).not.toContain('SqliteFeedbackAdapter')
    expect(preload).not.toContain('showOpenDialog')
  })

  it('keeps attachment paths inside Main and returns only staged metadata', () => {
    const handlers = readFileSync(path.resolve('src/main/ipc-handlers.ts'), 'utf8')
    const contract = readFileSync(path.resolve('src/shared/feedback.ts'), 'utf8')
    expect(handlers).toContain('feedbackAttachmentStaging.stagePaths(result.filePaths)')
    expect(handlers).toContain('feedbackAttachmentDiscard.discard(attachmentId)')
    expect(contract).not.toContain('filePath')
    expect(contract).not.toContain('content:')
  })
})
