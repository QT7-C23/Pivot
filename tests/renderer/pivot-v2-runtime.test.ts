import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionRecord, WorkItemSnapshot } from '../../src/shared/types/domain'
import { LocaleProvider } from '../../src/renderer/i18n/locale-context'
import { NowWorkspace } from '../../src/renderer/components/now-workspace'
import { PivotAppShell } from '../../src/renderer/components/pivot-app-shell'

describe('Pivot UI V2 rendered behavior', () => {
  it('renders the current Figma global rail while keeping internal routes out of it', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(PivotAppShell, {
        activeRoute: 'settings',
        children: createElement('div', null, 'settings'),
        onNavigate: () => undefined,
      }),
    ))

    for (const route of ['now', 'projects', 'automations', 'docs', 'marketplace', 'extensions', 'settings', 'help']) {
      expect(html).toContain(`data-route="${route}"`)
    }
    expect(html).not.toContain('data-route="work"')
    expect(html).not.toContain('data-route="artifacts"')
    expect(html.match(/data-route="settings"/g)).toHaveLength(1)
    expect(html).toContain('title="市场"')
    expect(html).toContain('aria-label="Profile"')
  })

  it('renders summary values from sessions and unified work snapshots', () => {
    const sessions = [
      session('session-1', 'First task'),
      session('session-2', 'Second task'),
      session('session-3', 'Third task'),
    ]
    const workItems = [
      workItem('active', 'running_local', {
        artifacts: 4,
        attention: 4,
        runStatus: 'running',
      }),
      workItem('done', 'delivered', {
        artifacts: 1,
        attention: 0,
        runStatus: 'completed',
      }),
    ]
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(NowWorkspace, {
        attentionMessage: 'Runtime requires review',
        isStreaming: false,
        onCreateProject: () => undefined,
        onNavigateToAutomations: () => undefined,
        onNavigateToExtensions: () => undefined,
        onNavigateToProjects: () => undefined,
        onOpenSession: async () => undefined,
        operationCount: 0,
        sessions,
        workItems,
      }),
    ))

    expect(html).toContain('data-figma-screen="1026:8514"')
    expect(html).toContain('pv-now-summary attention"><span>待处理</span><strong>5</strong>')
    expect(html).toContain('pv-now-summary running"><span>本地 / 远程运行</span><strong>1</strong>')
    expect(html).toContain('pv-now-summary accent"><span>已完成</span><strong>1</strong>')
    expect(html).toContain('pv-now-summary accent"><span>最近成果</span><strong>5</strong>')
    expect(html).toContain('First task')
    expect(html).toContain('Runtime requires review')
  })
})

function session(id: string, title: string): SessionRecord {
  return {
    createdAt: '2026-07-30T08:00:00.000Z',
    deletedAt: null,
    groupId: null,
    id,
    isFavorite: false,
    isPinned: false,
    isUnread: false,
    projectPath: 'D:\\Project\\Pivot',
    status: 'active',
    tags: [],
    title,
    updatedAt: '2026-07-30T08:00:00.000Z',
  }
}

function workItem(
  id: string,
  status: WorkItemSnapshot['task']['status'],
  counts: { artifacts: number; attention: number; runStatus: NonNullable<WorkItemSnapshot['run']>['status'] },
): WorkItemSnapshot {
  const sessionId = `session-${id}`
  const taskId = `task-${id}`
  return {
    artifacts: Array.from({ length: counts.artifacts }, (_, index) => ({
      id: `artifact-${id}-${index}`,
      sessionId,
      status: 'review_ready',
      taskId,
      title: `artifact-${id}-${index}.md`,
      type: 'document',
      updatedAt: '2026-07-30T08:00:00.000Z',
    })),
    attention: Array.from({ length: counts.attention }, (_, index) => ({
      createdAt: '2026-07-30T08:00:00.000Z',
      detail: 'Review the requested operation',
      id: `attention-${id}-${index}`,
      kind: 'permission',
      priority: 'high',
      runId: `run-${id}`,
      sessionId,
      taskId,
      title: 'Permission required',
    })),
    reviews: [],
    run: {
      completedSteps: counts.runStatus === 'completed' ? 1 : 0,
      id: `run-${id}`,
      location: 'local',
      runtimeId: 'pivot',
      runtimeLabel: 'Pivot Runtime',
      sessionId,
      status: counts.runStatus,
      taskId,
      totalSteps: 1,
      updatedAt: '2026-07-30T08:00:00.000Z',
    },
    task: {
      createdAt: '2026-07-30T08:00:00.000Z',
      id: taskId,
      planId: null,
      projectPath: 'D:\\Project\\Pivot',
      sessionId,
      status,
      studio: 'code',
      title: `${id} work`,
      updatedAt: '2026-07-30T08:00:00.000Z',
    },
  }
}
