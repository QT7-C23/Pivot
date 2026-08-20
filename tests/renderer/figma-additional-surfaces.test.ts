import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PermissionRequest } from '../../src/shared/types/domain'
import { AttentionCenter, AttentionDetail, projectAttentionItems } from '../../src/renderer/components/attention-center'
import { DocsFilesWorkspace } from '../../src/renderer/components/docs-files-workspace'
import { HelpWorkspace } from '../../src/renderer/components/help-workspace'

describe('current Figma additional surfaces', () => {
  it('projects only real runtime failures and permission requests into Attention Queue items', () => {
    const permission: PermissionRequest = {
      input: { path: 'src/auth/session.ts' },
      requestId: 'permission-1',
      runId: 'run-1',
      sessionId: 'session-1',
      toolName: 'write_file',
    }
    const items = projectAttentionItems({ error: 'Runtime connection lost', permissionRequests: [permission] })

    expect(items).toEqual([
      expect.objectContaining({ id: 'runtime:error', kind: 'runtime', severity: 'error', title: 'Runtime connection lost' }),
      expect.objectContaining({ id: 'permission:permission-1', kind: 'permission', severity: 'attention' }),
    ])
    expect(projectAttentionItems({ error: null, permissionRequests: [] })).toEqual([])
  })

  it('renders the Figma queue without demonstration notifications', () => {
    const html = renderToStaticMarkup(createElement(AttentionCenter, {
      items: [{ contextLabel: 'Active task', detail: 'Review requested access', id: 'permission:1', kind: 'permission', severity: 'attention', title: 'File access requested' }],
    }))

    expect(html).toContain('data-figma-state="425:6216"')
    expect(html).toContain('Attention Queue')
    expect(html).toContain('File access requested')
    expect(html).toContain('Review request')
    expect(html).not.toContain('API rate limit approaching')

    const detail = renderToStaticMarkup(createElement(AttentionDetail, {
      entry: {
        contextLabel: 'Active task', createdAt: null, detail: 'Review requested access', id: 'permission:1',
        kind: 'permission', recordId: null, revision: null, severity: 'attention', status: 'open',
        title: 'File access requested', updatedAt: null,
      },
      error: null,
      onBack: () => undefined,
      onReopen: () => undefined,
      onResolve: () => undefined,
      onReviewPermission: () => undefined,
    }))
    expect(detail).toContain('Evidence retained')
    expect(detail).toContain('Review request')
    expect(detail).toContain('Dismiss')
  })

  it('renders authentic resolved and reopened detail states', () => {
    const base = {
      contextLabel: 'Local Executable',
      createdAt: '2026-08-03T12:00:00.000Z',
      detail: 'Runtime connection lost',
      id: 'runtime:error',
      kind: 'runtime' as const,
      recordId: '11111111-1111-4111-8111-111111111111',
      revision: 2,
      severity: 'error' as const,
      title: 'Runtime connection lost',
      updatedAt: '2026-08-03T12:01:00.000Z',
    }
    const props = {
      error: null,
      onBack: () => undefined,
      onReopen: () => undefined,
      onResolve: () => undefined,
    }
    const resolved = renderToStaticMarkup(createElement(AttentionDetail, {
      ...props,
      entry: { ...base, status: 'resolved' as const },
    }))
    const reopened = renderToStaticMarkup(createElement(AttentionDetail, {
      ...props,
      entry: { ...base, revision: 3, status: 'reopened' as const },
      onSwitchRuntime: () => undefined,
    }))

    expect(resolved).toContain('data-figma-state="425:6268"')
    expect(resolved).toContain('RESOLVED')
    expect(resolved).toContain('Reopen')
    expect(reopened).toContain('data-figma-state="425:6287"')
    expect(reopened).toContain('REOPENED')
    expect(reopened).toContain('Switch Runtime')
  })

  it('renders Docs from supplied project files and exposes a real file-open action', () => {
    const html = renderToStaticMarkup(createElement(DocsFilesWorkspace, {
      files: [{ name: 'README.md', path: 'D:\\Project\\Pivot\\README.md', type: 'file' }],
      onChooseProject: () => undefined,
      onOpenFile: () => undefined,
      projectPath: 'D:\\Project\\Pivot',
    }))

    expect(html).toContain('data-figma-screen="549:3877"')
    expect(html).toContain('README.md')
    expect(html).toContain('Open document')
  })

  it('renders searchable Help entries that target real application routes', () => {
    const html = renderToStaticMarkup(createElement(HelpWorkspace, { onNavigate: () => undefined }))

    expect(html).toContain('data-figma-screen="248:5476"')
    expect(html).toContain('Models &amp; Providers')
    expect(html).toContain('Keyboard Shortcuts')
    expect(html).toContain('data-target-route="settings"')
    expect(html).toContain('data-target-route="docs"')
  })
})
