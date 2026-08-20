import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')

describe('feedback capability boundaries', () => {
  it('keeps contracts in shared and infrastructure behind narrow Ports', () => {
    const contract = readFileSync(path.join(root, 'shared/feedback.ts'), 'utf8')
    const ports = readFileSync(path.join(root, 'main/services/feedback-ports.ts'), 'utf8')
    expect(contract).not.toMatch(/node:fs|better-sqlite3|ipcMain|BrowserWindow|renderer\//)
    expect(ports).toContain('FeedbackReaderPort')
    expect(ports).toContain('FeedbackWriterPort')
    expect(ports).toContain('FeedbackAttachmentStagingPort')
    expect(ports).toContain('FeedbackAttachmentDiscardPort')
    expect(ports).not.toMatch(/better-sqlite3|BrowserWindow|ipcMain|renderer\//)
  })

  it('does not grant Renderer filesystem, database or Admin capabilities', () => {
    const page = readFileSync(path.join(root, 'renderer/components/feedback-settings-page.tsx'), 'utf8')
    const client = readFileSync(path.join(root, 'renderer/services/feedback-client.ts'), 'utf8')
    expect(`${page}\n${client}`).not.toMatch(/node:fs|better-sqlite3|Database|AdminPort|dialog|showOpenDialog/)
    expect(client).toContain('FeedbackClientPort')
    expect(client).toContain('FeedbackAttachmentSchema.parse')
    expect(client).toContain('FeedbackRecordSchema.parse')
  })
})
