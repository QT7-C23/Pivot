import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteAttentionAdapter } from '../../src/main/services/sqlite-attention-adapter'

const roots: string[] = []
const observation = {
  contextLabel: 'Local Executable',
  detail: 'The active process stopped unexpectedly.',
  kind: 'runtime' as const,
  severity: 'error' as const,
  sourceId: 'runtime:error',
  title: 'Runtime connection lost',
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('SQLite durable Attention adapter', () => {
  it('observes idempotently, persists resolution and reopens recurring evidence after restart', () => {
    const databasePath = createDatabasePath()
    let now = '2026-08-03T12:00:00.000Z'
    const first = new SqliteAttentionAdapter({
      databasePath,
      now: () => now,
      randomId: () => '11111111-1111-4111-8111-111111111111',
    })
    const observed = first.openObservationPort().observe(observation)
    expect(observed).toMatchObject({ revision: 1, status: 'open' })
    expect(first.openObservationPort().observe(observation)).toEqual(observed)
    now = '2026-08-03T12:01:00.000Z'
    const resolved = first.openLifecyclePort().resolve({
      attentionId: observed.id,
      expectedRevision: observed.revision,
    })
    expect(resolved).toMatchObject({ resolvedAt: now, revision: 2, status: 'resolved' })
    first.close()

    now = '2026-08-03T12:02:00.000Z'
    const reopened = new SqliteAttentionAdapter({ databasePath, now: () => now })
    expect(reopened.openReaderPort().list()).toEqual([resolved])
    const recurrence = reopened.openObservationPort().observe(observation)
    expect(recurrence).toMatchObject({ resolvedAt: null, revision: 3, status: 'reopened' })
    reopened.close()
  })

  it('uses optimistic revisions for resolve and explicit reopen', () => {
    const adapter = new SqliteAttentionAdapter({
      databasePath: createDatabasePath(),
      randomId: () => '11111111-1111-4111-8111-111111111111',
    })
    const observed = adapter.openObservationPort().observe(observation)
    expect(() => adapter.openLifecyclePort().resolve({
      attentionId: observed.id, expectedRevision: 9,
    })).toThrow(/revision/i)
    const resolved = adapter.openLifecyclePort().resolve({
      attentionId: observed.id, expectedRevision: 1,
    })
    const reopened = adapter.openLifecyclePort().reopen({
      attentionId: resolved.id, expectedRevision: resolved.revision,
    })
    expect(reopened).toMatchObject({ revision: 3, status: 'reopened' })
    expect(() => adapter.openLifecyclePort().reopen({
      attentionId: resolved.id, expectedRevision: resolved.revision,
    })).toThrow(/revision/i)
    adapter.close()
  })

  it('fails closed on corrupt persisted records and exposes only frozen narrow Ports', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteAttentionAdapter({
      databasePath,
      randomId: () => '11111111-1111-4111-8111-111111111111',
    })
    const reader = adapter.openReaderPort()
    const observer = adapter.openObservationPort()
    const lifecycle = adapter.openLifecyclePort()
    expect(Object.keys(reader)).toEqual(['list'])
    expect(Object.keys(observer)).toEqual(['observe'])
    expect(Object.keys(lifecycle)).toEqual(['resolve', 'reopen'])
    expect([reader, observer, lifecycle].every(Object.isFrozen)).toBe(true)
    observer.observe(observation)
    adapter.close()

    const db = new Database(databasePath)
    db.prepare("UPDATE attention_records SET status = 'forged'").run()
    db.close()
    const reopened = new SqliteAttentionAdapter({ databasePath })
    expect(() => reopened.openReaderPort().list()).toThrow(/invalid persisted attention/i)
    reopened.close()
  })
})

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-attention-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
