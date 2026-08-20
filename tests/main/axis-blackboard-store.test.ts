import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteAxisBlackboardStore } from '../../src/main/services/sqlite-axis-blackboard-store'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('SqliteAxisBlackboardStore', () => {
  it('exposes run-visible entries while isolating task-private state', () => {
    const store = createStore()
    store.create({ runId: 'run-1', sessionId: 'session-1' })
    const taskOne = store.openTaskPort(binding('task-1'))
    const taskTwo = store.openTaskPort(binding('task-2'))

    taskOne.appendFact({
      draft: {
        factId: 'fact-private',
        key: 'worker.private-note',
        value: { type: 'text', value: 'Only task one may read this.' },
        visibility: 'task',
      },
      expectedRevision: 1,
    })
    taskOne.appendFact({
      draft: {
        factId: 'fact-shared',
        key: 'run.shared-summary',
        value: { type: 'text', value: 'All tasks in the run may read this.' },
        visibility: 'run',
      },
      expectedRevision: 2,
    })

    expect(taskOne.read().facts.map((item) => item.factId)).toEqual(['fact-private', 'fact-shared'])
    expect(taskTwo.read().facts.map((item) => item.factId)).toEqual(['fact-shared'])
    expect(Object.keys(taskOne).sort()).toEqual(['appendEvidence', 'appendFact', 'read'])
    expect('getFull' in taskOne).toBe(false)
    expect('delete' in taskOne).toBe(false)
    store.close()
  })

  it('binds writes to the task port and rejects stale revisions', () => {
    const store = createStore()
    store.create({ runId: 'run-1', sessionId: 'session-1' })
    const task = store.openTaskPort(binding('task-1'))

    const next = task.appendEvidence({
      draft: {
        digestSha256: 'a'.repeat(64),
        evidenceId: 'evidence-1',
        evidenceType: 'test-result',
        locator: 'pivot://runs/run-1/evidence/evidence-1',
        mediaType: 'text/plain',
        source: 'gate',
        summary: 'Tests passed.',
        visibility: 'run',
      },
      expectedRevision: 1,
    })
    expect(next.evidence[0]).toMatchObject({ evidenceId: 'evidence-1', ownerTaskId: 'task-1' })

    expect(() => task.appendFact({
      draft: {
        factId: 'fact-stale',
        key: 'stale.write',
        value: { type: 'boolean', value: true },
        visibility: 'run',
      },
      expectedRevision: 1,
    })).toThrow(/revision conflict/i)
    store.close()
  })

  it('rejects cross-session access, duplicate entries, and forged ownership', () => {
    const store = createStore()
    store.create({ runId: 'run-1', sessionId: 'session-1' })
    const task = store.openTaskPort(binding('task-1'))

    task.appendFact({
      draft: {
        factId: 'fact-1',
        key: 'analysis.result',
        value: { type: 'number', value: 42 },
        visibility: 'run',
      },
      expectedRevision: 1,
    })
    expect(() => task.appendFact({
      draft: {
        factId: 'fact-1',
        key: 'analysis.duplicate',
        value: { type: 'number', value: 43 },
        visibility: 'run',
      },
      expectedRevision: 2,
    })).toThrow(/already exists/i)

    expect(() => store.openTaskPort({
      ...binding('task-2'),
      sessionId: 'session-other',
    }).read()).toThrow(/not found|binding/i)

    expect(() => task.appendFact({
      draft: {
        factId: 'fact-forged',
        key: 'forged.owner',
        ownerTaskId: 'task-2',
        value: { type: 'boolean', value: true },
        visibility: 'task',
      } as never,
      expectedRevision: 2,
    })).toThrow()
    store.close()
  })

  it('recovers revisions and scoped entries after reopening SQLite', () => {
    const directory = createTempDirectory()
    const databasePath = path.join(directory, 'blackboard.db')
    const first = new SqliteAxisBlackboardStore(databasePath, {
      clock: () => new Date('2026-07-27T00:00:00.000Z'),
    })
    first.create({ runId: 'run-1', sessionId: 'session-1' })
    first.openTaskPort(binding('task-1')).appendFact({
      draft: {
        factId: 'fact-1',
        key: 'recovered.fact',
        value: { type: 'string-list', value: ['one', 'two'] },
        visibility: 'task',
      },
      expectedRevision: 1,
    })
    first.close()

    const reopened = new SqliteAxisBlackboardStore(databasePath)
    expect(reopened.openTaskPort(binding('task-1')).read()).toMatchObject({
      facts: [{ factId: 'fact-1', ownerTaskId: 'task-1' }],
      revision: 2,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })
    reopened.close()
  })

  it('returns detached views instead of exposing persisted mutable state', () => {
    const store = createStore()
    store.create({ runId: 'run-1', sessionId: 'session-1' })
    const task = store.openTaskPort(binding('task-1'))
    const view = task.appendFact({
      draft: {
        factId: 'fact-1',
        key: 'immutable.view',
        value: { type: 'boolean', value: true },
        visibility: 'run',
      },
      expectedRevision: 1,
    })

    view.facts.splice(0)
    expect(task.read().facts.map((fact) => fact.factId)).toEqual(['fact-1'])
    store.close()
  })

  it('deletes every blackboard owned by one session without touching another session', () => {
    const store = createStore()
    store.create({ runId: 'run-1', sessionId: 'session-1' })
    store.create({ runId: 'run-2', sessionId: 'session-1' })
    store.create({ runId: 'run-3', sessionId: 'session-2' })

    expect(store.deleteForSession('session-1')).toBe(2)
    expect(store.getFull({ runId: 'run-1', sessionId: 'session-1' })).toBeNull()
    expect(store.getFull({ runId: 'run-2', sessionId: 'session-1' })).toBeNull()
    expect(store.getFull({ runId: 'run-3', sessionId: 'session-2' })).not.toBeNull()
    store.close()
  })
})

function createStore(): SqliteAxisBlackboardStore {
  return new SqliteAxisBlackboardStore(':memory:', {
    clock: () => new Date('2026-07-27T00:00:00.000Z'),
  })
}

function binding(taskId: string) {
  return { runId: 'run-1', sessionId: 'session-1', taskId }
}

function createTempDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'pivot-blackboard-'))
  tempDirectories.push(directory)
  return directory
}
