import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteFeedbackAdapter } from '../../src/main/services/sqlite-feedback-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('SQLite feedback adapter', () => {
  it('stages real attachment bytes, submits once and recovers exact history after restart', () => {
    const root = createRoot()
    const databasePath = path.join(root, 'pivot.sqlite')
    const attachmentPath = path.join(root, 'trace.log')
    writeFileSync(attachmentPath, 'failure evidence', 'utf8')
    const first = new SqliteFeedbackAdapter({
      databasePath,
      now: () => '2026-08-03T12:00:00.000Z',
      randomId: () => '11111111-1111-4111-8111-111111111111',
    })
    const [attachment] = first.openAttachmentStagingPort().stagePaths([attachmentPath])
    expect(attachment).toEqual({
      byteLength: 16,
      id: '11111111-1111-4111-8111-111111111111',
      name: 'trace.log',
    })
    const request = {
      attachmentIds: [attachment!.id],
      description: 'The editor becomes slow after opening a large project.',
      priority: 'medium' as const,
      submissionId: '22222222-2222-4222-8222-222222222222',
      title: 'Editor slows down',
      type: 'bug-report' as const,
    }
    const saved = first.openWriterPort().submit(request)
    expect(saved.attachments).toEqual([attachment])
    expect(first.openWriterPort().submit(request)).toEqual(saved)
    first.close()

    const reopened = new SqliteFeedbackAdapter({ databasePath })
    expect(reopened.openReaderPort().list()).toEqual([saved])
    reopened.close()
  })

  it('rejects missing, unsupported and already-owned attachments without partial records', () => {
    const root = createRoot()
    const databasePath = path.join(root, 'pivot.sqlite')
    const executable = path.join(root, 'payload.exe')
    writeFileSync(executable, 'not allowed', 'utf8')
    const adapter = new SqliteFeedbackAdapter({ databasePath })
    expect(() => adapter.openAttachmentStagingPort().stagePaths([path.join(root, 'missing.log')])).toThrow()
    expect(() => adapter.openAttachmentStagingPort().stagePaths([executable])).toThrow(/unsupported/i)
    expect(() => adapter.openWriterPort().submit({
      attachmentIds: ['11111111-1111-4111-8111-111111111111'],
      description: 'Details', priority: 'low',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Missing attachment',
      type: 'other',
    })).toThrow(/attachment/i)
    expect(adapter.openReaderPort().list()).toEqual([])
    adapter.close()
  })

  it('fails closed when persisted feedback is corrupted and exposes frozen capabilities', () => {
    const root = createRoot()
    const databasePath = path.join(root, 'pivot.sqlite')
    const adapter = new SqliteFeedbackAdapter({ databasePath })
    const reader = adapter.openReaderPort()
    const writer = adapter.openWriterPort()
    const staging = adapter.openAttachmentStagingPort()
    expect(Object.keys(reader)).toEqual(['list'])
    expect(Object.keys(writer)).toEqual(['submit'])
    expect(Object.keys(staging)).toEqual(['stagePaths'])
    expect([reader, writer, staging].every(Object.isFrozen)).toBe(true)
    writer.submit({
      attachmentIds: [], description: 'Details', priority: 'high',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Corrupt me',
      type: 'bug-report',
    })
    adapter.close()
    const db = new Database(databasePath)
    db.prepare("UPDATE feedback_records SET title = ''").run()
    db.close()
    const reopened = new SqliteFeedbackAdapter({ databasePath })
    expect(() => reopened.openReaderPort().list()).toThrow(/invalid persisted feedback/i)
    reopened.close()
  })

  it('immediately discards unsubmitted attachment bytes but cannot discard owned evidence', () => {
    const root = createRoot()
    const attachmentPath = path.join(root, 'discard.log')
    writeFileSync(attachmentPath, 'discard me', 'utf8')
    const adapter = new SqliteFeedbackAdapter({ databasePath: path.join(root, 'pivot.sqlite') })
    const attachment = adapter.openAttachmentStagingPort().stagePaths([attachmentPath])[0]!
    const discard = adapter.openAttachmentDiscardPort()
    expect(Object.keys(discard)).toEqual(['discard'])
    expect(Object.isFrozen(discard)).toBe(true)
    discard.discard(attachment.id)
    expect(() => adapter.openWriterPort().submit({
      attachmentIds: [attachment.id], description: 'Details', priority: 'low',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Discarded', type: 'other',
    })).toThrow(/attachment/i)
    adapter.close()
  })

  it('removes abandoned staged blobs during restart recovery', () => {
    const root = createRoot()
    const databasePath = path.join(root, 'pivot.sqlite')
    const attachmentPath = path.join(root, 'abandoned.txt')
    writeFileSync(attachmentPath, 'temporary evidence', 'utf8')
    const first = new SqliteFeedbackAdapter({ databasePath })
    const [attachment] = first.openAttachmentStagingPort().stagePaths([attachmentPath])
    first.close()

    const reopened = new SqliteFeedbackAdapter({ databasePath })
    expect(() => reopened.openWriterPort().submit({
      attachmentIds: [attachment!.id], description: 'Details', priority: 'low',
      submissionId: '22222222-2222-4222-8222-222222222222', title: 'Recovered draft',
      type: 'other',
    })).toThrow(/attachment/i)
    expect(reopened.openReaderPort().list()).toEqual([])
    reopened.close()
  })
})

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-feedback-'))
  roots.push(root)
  return root
}
