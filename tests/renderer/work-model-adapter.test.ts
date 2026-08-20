import { describe, expect, it } from 'vitest'
import type { FileReviewRecord, PlanDocument, SessionRecord } from '../../src/shared/types/domain'
import { projectLegacyWorkItems } from '../../src/renderer/adapters/work-model-adapter'

const session: SessionRecord = {
  createdAt: '2026-07-20T10:00:00.000Z', deletedAt: null, groupId: null, id: 'session-1', isFavorite: false,
  isPinned: false, isUnread: false, projectPath: 'D:\\Project\\Pivot', status: 'active', tags: [], title: 'Pivot',
  updatedAt: '2026-07-21T10:00:00.000Z',
}

const plan: PlanDocument = {
  createdAt: session.createdAt, executionMode: 'auto', id: 'plan-1', sessionId: session.id, source: 'Build work center',
  status: 'executing', steps: [
    { description: '', id: 'step-1', order: 0, selected: true, status: 'done', targets: [], title: 'Contract' },
    { description: '', id: 'step-2', order: 1, selected: true, status: 'running', targets: [], title: 'UI' },
  ], title: 'Build work center', updatedAt: session.updatedAt, version: 1,
}

function project(overrides: Partial<Parameters<typeof projectLegacyWorkItems>[0]> = {}) {
  return projectLegacyWorkItems({
    activeRunId: 'run-1', activeSessionId: session.id, adapterInfo: { id: 'codex', kind: 'cli', label: 'Codex', profileId: 'codex' },
    agentError: null, agentState: 'executing', fileReviews: [], permissionRequests: [], plans: [plan], sessions: [session],
    ...overrides,
  })[0]
}

describe('legacy work model adapter', () => {
  it('projects a session, plan, and active runtime into stable task and run contracts', () => {
    const item = project()
    expect(item.task).toMatchObject({ id: 'task:session-1', planId: 'plan-1', status: 'running_local', studio: 'code' })
    expect(item.run).toMatchObject({ completedSteps: 1, id: 'run-1', runtimeLabel: 'Codex', status: 'running', totalSteps: 2 })
  })

  it('gives permission attention precedence over running and review states', () => {
    const item = project({ permissionRequests: [{ input: {}, requestId: 'permission-1', runId: 'run-1', sessionId: session.id, toolName: 'write_file' }] })
    expect(item.task.status).toBe('waiting_permission')
    expect(item.run?.status).toBe('waiting')
    expect(item.attention[0]).toMatchObject({ id: 'attention:permission-1', kind: 'permission', priority: 'high' })
  })

  it('preserves remote runtime location in both task and run contracts', () => {
    const item = project({ adapterInfo: { id: 'hosted', kind: 'http', label: 'Hosted Agent' } })
    expect(item.task.status).toBe('running_remote')
    expect(item.run).toMatchObject({ location: 'remote', runtimeLabel: 'Hosted Agent' })
  })

  it('maps file reviews to typed artifacts without leaking them across sessions', () => {
    const review: FileReviewRecord = {
      checkpointId: null, createdAt: session.createdAt, currentContent: 'b', filePath: 'D:\\Project\\Pivot\\src\\app.ts', hunks: [],
      id: 'review-1', modifiedContent: 'b', originalContent: 'a', sessionId: session.id, status: 'pending', updatedAt: session.updatedAt,
    }
    const other = { ...session, id: 'session-2', title: 'Other' }
    const items = projectLegacyWorkItems({
      activeRunId: null, activeSessionId: null, adapterInfo: null, agentError: null, agentState: 'idle', fileReviews: [review],
      permissionRequests: [], plans: [], sessions: [session, other],
    })
    expect(items.find((item) => item.task.sessionId === session.id)?.artifacts[0]).toMatchObject({ title: 'app.ts', type: 'code-change', status: 'review_ready' })
    expect(items.find((item) => item.task.sessionId === 'session-2')?.artifacts).toEqual([])
  })
})
