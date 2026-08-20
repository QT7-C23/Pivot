import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentAdapter } from '../../src/main/services/agent-adapters'
import { AgentRuntime } from '../../src/main/services/agent-runtime'
import { SqliteAgentRunEventAdapter } from '../../src/main/services/sqlite-agent-run-event-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('SQLite Agent Run Event adapter', () => {
  it('persists the real AgentRuntime failure path across process restart', async () => {
    const databasePath = createDatabasePath()
    const store = new SqliteAgentRunEventAdapter({ databasePath })
    const adapter: AgentAdapter = {
      id: 'failing-cli', info: { id: 'failing-cli', kind: 'local', label: 'Failing CLI' }, label: 'Failing CLI',
      async *stream() {
        yield { text: 'partial', type: 'text' }
        throw new TypeError('CLI exited unexpectedly')
      },
    }
    const runtime = new AgentRuntime({ adapter, events: store.openWriterPort() })

    await expect(runtime.send({ sessionId: 'session-real', text: 'run' }, () => undefined))
      .rejects.toThrow('CLI exited unexpectedly')
    store.close()

    const reopened = new SqliteAgentRunEventAdapter({ databasePath })
    const events = reopened.openReaderPort().listSession('session-real')
    expect(events.map(({ type }) => type)).toEqual([
      'run-started', 'phase-changed', 'phase-changed', 'run-finished',
    ])
    expect(events.at(-1)).toMatchObject({
      data: { errorName: 'TypeError', responseBytes: 7, status: 'failed' },
      type: 'run-finished',
    })
    reopened.close()
  })

  it('appends contiguous session evidence and restores it exactly after restart', () => {
    const databasePath = createDatabasePath()
    let event = 0
    const first = new SqliteAgentRunEventAdapter({
      databasePath,
      now: () => '2026-08-14T00:00:00.000Z',
      randomId: () => `event-${++event}`,
    })
    const writer = first.openWriterPort()
    writer.append(started('run-1'))
    writer.append({
      data: { phase: 'thinking' }, runId: 'run-1', sessionId: 'session-1', type: 'phase-changed',
    })
    writer.append({
      data: { errorName: null, responseBytes: 12, status: 'completed' },
      runId: 'run-1', sessionId: 'session-1', type: 'run-finished',
    })
    writer.append(started('run-2'))
    expect(first.openReaderPort().listSession('session-1').map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4])
    first.close()

    const reopened = new SqliteAgentRunEventAdapter({ databasePath })
    expect(reopened.openReaderPort().listRun('run-1').map(({ type }) => type)).toEqual([
      'run-started', 'phase-changed', 'run-finished',
    ])
    reopened.close()
  })

  it('fails closed on invalid run ordering and run ownership', () => {
    const adapter = new SqliteAgentRunEventAdapter({ databasePath: createDatabasePath() })
    const writer = adapter.openWriterPort()
    expect(() => writer.append({
      data: { phase: 'thinking' }, runId: 'run-1', sessionId: 'session-1', type: 'phase-changed',
    })).toThrow(/must start/i)
    writer.append(started('run-1'))
    expect(() => writer.append(started('run-1'))).toThrow(/already started/i)
    expect(() => writer.append({ ...started('run-1'), sessionId: 'session-2' })).toThrow(/ownership/i)
    writer.append({
      data: { errorName: null, responseBytes: 0, status: 'completed' },
      runId: 'run-1', sessionId: 'session-1', type: 'run-finished',
    })
    expect(() => writer.append({
      data: { phase: 'writing' }, runId: 'run-1', sessionId: 'session-1', type: 'phase-changed',
    })).toThrow(/already finished/i)
    adapter.close()
  })

  it('rejects corrupt persisted rows after restart', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteAgentRunEventAdapter({ databasePath })
    adapter.openWriterPort().append(started('run-1'))
    adapter.close()
    const db = new Database(databasePath)
    db.prepare("UPDATE agent_run_events SET payload_json = '{bad-json'").run()
    db.close()

    const reopened = new SqliteAgentRunEventAdapter({ databasePath })
    expect(() => reopened.openReaderPort().listSession('session-1')).toThrow(/invalid persisted agent run event/i)
    reopened.close()
  })

  it('exposes only frozen narrow capabilities and deletes owned session evidence', () => {
    const databasePath = createDatabasePath()
    const adapter = new SqliteAgentRunEventAdapter({ databasePath })
    const reader = adapter.openReaderPort()
    const writer = adapter.openWriterPort()
    const lifecycle = adapter.openLifecyclePort()
    expect(Object.keys(reader)).toEqual(['listRun', 'listSession'])
    expect(Object.keys(writer)).toEqual(['append'])
    expect(Object.keys(lifecycle)).toEqual(['deleteForSession'])
    expect([reader, writer, lifecycle].every(Object.isFrozen)).toBe(true)
    writer.append(started('run-1'))
    lifecycle.deleteForSession('session-1')
    expect(reader.listSession('session-1')).toEqual([])
    adapter.close()

    const db = new Database(databasePath, { readonly: true })
    expect(db.prepare('SELECT version FROM agent_run_event_migrations').all()).toEqual([{ version: 1 }])
    db.close()
  })
})

function started(runId: string) {
  return {
    data: { adapterId: 'local', profileId: null, toolPolicy: 'full' as const },
    runId,
    sessionId: 'session-1',
    type: 'run-started' as const,
  }
}

function createDatabasePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-agent-run-events-'))
  roots.push(root)
  return path.join(root, 'pivot.sqlite')
}
