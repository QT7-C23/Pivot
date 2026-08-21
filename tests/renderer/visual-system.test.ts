import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('Pivot UI V2 visual system contract', () => {
  it('loads the Figma V2 contract after all compatibility styles', () => {
    const entry = readFileSync(path.join(rendererRoot, 'main.tsx'), 'utf8')
    const compatibilityIndex = entry.indexOf("import './pivot-012.css'")
    const v2Index = entry.indexOf("import './pivot-v2.css'")

    expect(compatibilityIndex).toBeGreaterThan(-1)
    expect(v2Index).toBeGreaterThan(compatibilityIndex)
  })

  it('implements the fixed AppShell dimensions and panel contract from Figma', () => {
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')
    const designSystem = readFileSync(path.join(rendererRoot, 'pivot-design-system.css'), 'utf8')
    for (const selector of ['.pv-app-shell', '.pv-global-rail', '.pv-titlebar', '.pv-context-sidebar', '.pv-studio-stage', '.pv-activity-panel']) {
      expect(css).toContain(selector)
    }
    expect(css).toContain('grid-template-columns: 52px minmax(0, 1fr)')
    expect(css).toContain('grid-template-rows: 44px minmax(0, 1fr)')
    expect(css).toContain('grid-template-columns: 264px minmax(0, 1fr) 320px')
    expect(designSystem).toContain('--pv-design-canvas-width: 1440px')
    expect(designSystem).toContain('--pv-design-canvas-height: 900px')
    expect(css).not.toMatch(/@media \(max-width:/)
  })

  it('implements the complete Figma Dashboard/1440 information hierarchy without demo data', () => {
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')
    const dashboard = readFileSync(path.join(rendererRoot, 'components/dashboard-workspace.tsx'), 'utf8')

    expect(css).toContain('.pv-dashboard-metrics')
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    for (const region of ['greeting', 'attention', 'agent-activity', 'active-tasks', 'runs', 'continue', 'artifacts']) {
      expect(dashboard).toContain(`pv-dashboard-${region}`)
    }
    expect(dashboard).toContain('operations: AgentOperation[]')
    expect(dashboard).toContain('data-figma-screen="1026:8514"')
    expect(dashboard).not.toMatch(/Good afternoon, Alex|Claude Opus|56 tasks|IPC debug failed/)
    expect(dashboard).not.toContain('<h1>{copy.title}</h1>')
    expect(css).not.toMatch(/@media \(max-width:/)
  })

  it('uses one route-driven shell instead of separate chat and IDE products', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const shell = readFileSync(path.join(rendererRoot, 'components/pivot-app-shell.tsx'), 'utf8')
    const store = readFileSync(path.join(rendererRoot, 'stores/ui.store.ts'), 'utf8')
    const welcome = readFileSync(path.join(rendererRoot, 'components/welcome-screen.tsx'), 'utf8')
    const keyboard = readFileSync(path.join(rendererRoot, 'hooks/usePivotKeyboardNavigation.ts'), 'utf8')
    expect(app).toContain('<PivotAppShell')
    expect(app).not.toContain('workbenchMode')
    expect(app).not.toContain('<ModeStrip')
    expect(app).not.toContain('setMode')
    expect(app).not.toContain("mode === 'terminal'")
    expect(store).not.toContain('AppMode')
    expect(store).not.toContain('toggleMode')
    expect(store).not.toContain('IdeActivity')
    expect(store).not.toContain('WorkbenchTab')
    expect(welcome).not.toContain("'chat' | 'ide'")
    expect(welcome).not.toContain('welcome-mode-grid')
    expect(shell).toContain("import type { PivotRoute }")
    expect(app).toContain('usePivotKeyboardNavigation')
    expect(keyboard).toContain('resolvePivotShortcut')
  })

  it('uses fixed-width runtime controls and separate composer layout cells', () => {
    const composer = readFileSync(path.join(rendererRoot, 'components/chat-workspace.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')
    expect(composer).toContain('className="composer-input-row"')
    expect(composer).toContain('className="composer-runtime-controls"')
    expect(composer).toContain("data-state={isStreaming ? 'running'")
    expect(composer).toContain("type={isStreaming ? 'button' : 'submit'}")
    expect(composer).toContain('onAbort()')
    expect(css).toContain('grid-template-columns: auto minmax(0, 1fr) 36px')
    expect(css).toContain('width: 142px')
  })

  it('keeps errors inside the stage and does not auto-hide recoverable failures', () => {
    const source = readFileSync(path.join(rendererRoot, 'components/dismissible-error-banner.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')
    expect(source).not.toContain('setTimeout')
    expect(source).toContain('pv-stage-attention')
    expect(css).toContain('.pv-stage-attention')
    expect(css).toContain('position: static')
  })
})
