import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('Pivot UI V2 route and runtime contracts', () => {
  it('exposes every top-level workspace as an explicit route', () => {
    const source = readFileSync(path.join(rendererRoot, 'navigation/pivot-navigation.ts'), 'utf8')
    for (const route of ['now', 'sessions', 'projects', 'work', 'artifacts', 'automations', 'docs', 'runtimes', 'marketplace', 'extensions', 'settings', 'help']) {
      expect(source).toContain("'" + route + "'")
    }
  })

  it('turns missing CLIs into a recoverable runtime state', () => {
    const source = readFileSync(path.join(rendererRoot, 'components/runtime-hub-workspace.tsx'), 'utf8')
    expect(source).toContain('Local CLI')
    expect(source).toContain('CLI unavailable')
    expect(source).toContain('Install ')
    expect(source).not.toContain('spawn ')
    expect(source).not.toContain('ENOENT')
  })

  it('uses the Figma token namespace and reduced-motion contract', () => {
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')
    for (const token of ['--pv-bg-canvas', '--pv-bg-surface', '--pv-bg-elevated', '--pv-text-primary', '--pv-accent-default']) {
      expect(css).toContain(token + ':')
    }
    for (const color of ['#f3f1ec', '#faf9f6', '#ffffff', '#1c201f', '#626965', '#d8d5ce', '#19766f', '#111315', '#171a1d', '#1e2226', '#5cc8be']) {
      expect(css).toContain(color)
    }
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('matches the current Figma GlobalRail without hiding internal work routes', () => {
    const shell = readFileSync(path.join(rendererRoot, 'components/pivot-app-shell.tsx'), 'utf8')
    const now = readFileSync(path.join(rendererRoot, 'components/now-workspace.tsx'), 'utf8')
    const primaryNavigation = shell.slice(shell.indexOf('const PRIMARY_NAVIGATION'), shell.indexOf('const SECONDARY_NAVIGATION'))

    for (const route of ['now', 'projects', 'automations', 'docs']) {
      expect(primaryNavigation).toContain(`route: '${route}'`)
    }
    for (const route of ['work', 'artifacts']) {
      expect(primaryNavigation).not.toContain(`route: '${route}'`)
    }
    expect(primaryNavigation).not.toContain("route: 'sessions'")
    expect(primaryNavigation).not.toContain("route: 'runtimes'")
    expect(shell).toContain("route: 'marketplace'")
    expect(shell).toContain("route: 'help'")
    expect(shell).toContain('pv-rail-avatar')
    expect(shell).toContain('Figma component 1337:9921')
    expect(now).toContain('Local / Remote Runs')
    expect(now).toContain('Recent Artifacts')
    expect(now).toContain('New Automation')
    expect(now).toContain('Browse Templates')
    expect(now).toContain('WorkItemSnapshot')
  })

  it('keeps one stable Figma rail while navigating into Settings', () => {
    const shell = readFileSync(path.join(rendererRoot, 'components/pivot-app-shell.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')

    for (const className of ['pv-titlebar-brand', 'pv-command-palette-trigger', 'pv-shell-body']) {
      expect(shell).toContain(className)
    }
    expect(shell).not.toContain('SETTINGS_PRIMARY_NAVIGATION')
    expect(shell).not.toContain('SETTINGS_SECONDARY_NAVIGATION')
    expect(shell).not.toContain("activeRoute === 'settings' ?")
    expect(shell.match(/PRIMARY_NAVIGATION\.map/g)).toHaveLength(1)
    expect(shell.match(/SECONDARY_NAVIGATION\.map/g)).toHaveLength(1)
    expect(css).toContain('justify-content: flex-start')
    expect(css).toContain('.pv-rail-bottom { margin-top: auto; }')
  })

  it('projects real work data into the Figma dashboard hierarchy', () => {
    const now = readFileSync(path.join(rendererRoot, 'components/now-workspace.tsx'), 'utf8')

    expect(now).toContain('data-figma-screen="1026:8514"')
    expect(now).toContain('const completedWorkCount')
    expect(now).toContain('className="pv-now-summary-grid"')
    expect(now).toContain('className="pv-now-dashboard"')
    expect(now).toContain('recentSessions.length')
    expect(now).toContain('attentionCount')
    expect(now).toContain('activeRuns.length')
    expect(now).toContain('allArtifacts.length')
  })

  it('uses dedicated Figma context sidebars instead of legacy project controls', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const sidebar = readFileSync(path.join(rendererRoot, 'components/workspace-context-sidebar.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')

    expect(app).toContain('<WorkspaceContextSidebar')
    expect(app).toContain('variant="now"')
    expect(app).toContain('variant="project"')
    expect(sidebar).toContain("variant: 'now' | 'project'")
    expect(sidebar).not.toContain('onChooseProject')
    expect(sidebar).not.toContain('onSearchSessions')
    expect(css).toContain('min-height: 48px')
    expect(css).toContain('font-size: 10px')
  })

  it('implements Figma Project Overview as an independent data-backed screen', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const project = readFileSync(path.join(rendererRoot, 'components/project-overview-workspace.tsx'), 'utf8')

    expect(app).toContain('<ProjectOverviewWorkspace')
    expect(app).toContain("activeRoute === 'projects'")
    expect(app).not.toContain("activeRoute === 'sessions' || activeRoute === 'projects'")
    expect(project).toContain('data-figma-screen="63:394"')
    expect(project).toContain('WorkItemSnapshot')
    expect(project).toContain('ArtifactRecord')
    expect(project).not.toContain('will live here')
  })

  it('implements Figma Artifact Review with explicit three-column ownership', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const chrome = readFileSync(path.join(rendererRoot, 'components/artifact-review-chrome.tsx'), 'utf8')
    const review = readFileSync(path.join(rendererRoot, 'components/file-review-workspace.tsx'), 'utf8')

    expect(app).toContain('<ArtifactReviewContextSidebar')
    expect(app).toContain('<ArtifactReviewInspector')
    expect(review).toContain('data-figma-screen="64:822"')
    expect(chrome).toContain('FileReviewRecord')
    expect(review).not.toContain('diff-hunk-list')
  })

  it('removes legacy workspace chrome from the Figma Conversation screen', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const inspector = readFileSync(path.join(rendererRoot, 'components/agent-status-panel.tsx'), 'utf8')
    const conversationBlock = app.slice(app.indexOf("{activeRoute === 'sessions'"), app.indexOf('</PivotAppShell>'))

    expect(conversationBlock).toContain('data-figma-screen="63:190"')
    expect(conversationBlock).not.toContain('<WorkbenchTabButton')
    expect(app).not.toContain('<ConversationSidebar')
    expect(inspector).toContain('data-figma-region="conversation-inspector"')
    expect(inspector).toContain("'activity' | 'inspector'")
  })

  it('replaces the Automations placeholder with a typed Figma screen', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const automations = readFileSync(path.join(rendererRoot, 'components/automation-workspace.tsx'), 'utf8')

    expect(app).toContain('<AutomationWorkspace')
    expect(app).not.toContain('<CapabilityWorkspace')
    expect(automations).toContain('AutomationWorkspaceSnapshot')
    expect(automations).toContain('data-figma-screen="71:1234"')
    expect(automations).not.toContain('Run Now')
    expect(automations).not.toContain('Delete')
  })

  it('separates the real provider marketplace from the empty installed-extension inventory', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const marketplace = readFileSync(path.join(rendererRoot, 'components/plugin-ecosystem-page.tsx'), 'utf8')
    const extensions = readFileSync(path.join(rendererRoot, 'components/extensions-empty-workspace.tsx'), 'utf8')

    expect(app).toContain('surface="marketplace"')
    expect(app).toContain('<ExtensionsEmptyWorkspace')
    expect(marketplace).toContain('useProviderStore')
    expect(marketplace).toContain('plugin-policy-card')
    expect(extensions).toContain('data-figma-screen="597:6403"')
    expect(`${marketplace}\n${extensions}`).not.toMatch(/price|purchase|subscribe|checkout|trial/i)
  })

  it('wires the current Docs, Help, and attached Attention Queue screens to production state', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const docs = readFileSync(path.join(rendererRoot, 'components/docs-files-workspace.tsx'), 'utf8')
    const help = readFileSync(path.join(rendererRoot, 'components/help-workspace.tsx'), 'utf8')
    const attention = readFileSync(path.join(rendererRoot, 'components/attention-center.tsx'), 'utf8')

    expect(app).toContain('<DocsFilesWorkspace')
    expect(app).toContain('<HelpWorkspace')
    expect(app).toContain('<AttentionCenter')
    expect(docs).toContain('data-figma-screen="549:3877"')
    expect(docs).toContain('FileTreeEntry')
    expect(help).toContain('data-figma-screen="248:5476"')
    expect(attention).toContain('data-figma-state="425:6216"')
    expect(attention).toContain('PermissionRequest')
    for (const source of [docs, help, attention]) {
      expect(source).not.toMatch(/window\.pivot|node:fs|better-sqlite3|ipcRenderer/)
    }
  })

  it('boots into the Figma light theme before React paints', () => {
    const html = readFileSync(path.join(rendererRoot, 'index.html'), 'utf8')
    const entry = readFileSync(path.join(rendererRoot, 'main.tsx'), 'utf8')

    expect(html).toContain('<html data-theme="light"')
    expect(entry).toContain("localStorage.getItem('pivot:theme-explicit') === '1'")
    expect(entry).toContain("document.documentElement.dataset.theme")
  })

  it('localizes the new Now and Runtime Hub surfaces instead of bypassing the locale contract', () => {
    const now = readFileSync(path.join(rendererRoot, 'components/now-workspace.tsx'), 'utf8')
    const runtime = readFileSync(path.join(rendererRoot, 'components/runtime-hub-workspace.tsx'), 'utf8')
    expect(now).toContain('useLocale()')
    expect(now).toContain("'zh-CN'")
    expect(runtime).toContain('useLocale()')
    expect(runtime).toContain('PIVOT 思考引擎')
  })

  it('uses explicit Task, Run, Artifact, Review, and Attention contracts in the Work center', () => {
    const workCenter = readFileSync(path.join(rendererRoot, 'components/work-center-workspace.tsx'), 'utf8')
    const adapter = readFileSync(path.join(rendererRoot, 'adapters/work-model-adapter.ts'), 'utf8')
    expect(workCenter).toContain('WorkItemSnapshot')
    expect(workCenter).toContain('Plan & activity')
    expect(adapter).toContain('projectLegacyWorkItems')
    expect(adapter).toContain('Compatibility boundary')
    expect(workCenter).not.toContain('will live here')
  })
})
