import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('Pivot UI V2 completion contracts', () => {
  it('tracks every user-supplied screen node in the stable design manifest', () => {
    const manifest = readFileSync(path.resolve(process.cwd(), 'docs/design/pivot-ui-v2-screen-manifest-2026-08-21.md'), 'utf8')
    const nodes = ['1026:8514', '1332:9449', '818:9607', '818:9019', '818:8988', '818:12754', '818:14447', '818:14878', '818:15791', '818:13243', '818:16236', '818:13638', '818:14000', '818:14210', '1499:11725', '1499:12679', '1499:12887', '1506:9442', '1476:8909', '818:9249', '818:22103', '818:10388', '818:20102', '818:20379', '818:20645', '818:21049', '818:22354', '818:22642', '818:23054', '818:4102', '818:4269', '818:4457', '818:12358', '818:5762', '818:11070', '818:5444', '1171:9637', '1171:11360', '818:11341', '818:4642', '818:5141', '1405:10653', '1405:11063', '1405:11501', '1405:11877', '1406:11244', '1406:11690', '1406:12069', '1406:12440', '818:5929', '818:6184', '818:6343', '818:6499', '818:18002', '818:6686', '818:12562', '818:21302', '818:21434']
    for (const node of nodes) expect(manifest).toContain(`\`${node}\``)
    expect(manifest).toContain('Figma examples define layout and component state, never production records')
  })

  it('implements the three Figma onboarding frames with persisted product preferences', () => {
    const welcome = readFileSync(path.join(rendererRoot, 'components/welcome-screen.tsx'), 'utf8')

    for (const node of ['1285:8199', '1291:8035', '1291:8129']) {
      expect(welcome).toContain(`'${node}'`)
    }
    expect(welcome).toContain("useState<OnboardingStep>('welcome')")
    expect(welcome).toContain('useApplicationPreferencesStore')
    for (const preference of ['restoreSessions', 'startMinimized', 'notificationLevel', 'theme']) {
      expect(welcome).toContain(preference)
    }
    expect(welcome).toContain("from './ui-button'")
    expect(welcome).not.toContain('SpotlightSurface')
  })

  it('matches the current GlobalRail destinations without inventing database data', () => {
    const shell = readFileSync(path.join(rendererRoot, 'components/pivot-app-shell.tsx'), 'utf8')
    const navigation = readFileSync(path.join(rendererRoot, 'navigation/pivot-navigation.ts'), 'utf8')
    const database = readFileSync(path.join(rendererRoot, 'components/database-workspace.tsx'), 'utf8')

    expect(navigation).toContain("| 'database'")
    expect(shell).toContain("route: 'database'")
    expect(shell).toContain("en: 'DB'")
    expect(shell).toContain("en: 'Toolkit'")
    expect(database).toContain('data-figma-screen="1506:9442"')
    expect(database).toContain('Under Construction')
    expect(database).not.toMatch(/mock|fixture|sample rows|fake data/i)
  })

  it('uses the exported brand asset and one final semantic stylesheet import', () => {
    const shell = readFileSync(path.join(rendererRoot, 'components/pivot-app-shell.tsx'), 'utf8')
    const entry = readFileSync(path.join(rendererRoot, 'main.tsx'), 'utf8')

    expect(shell).toContain("pivot-logo-mark.png")
    expect(shell).not.toContain('pv-brand-glyph')
    expect(entry.match(/import '\.\/pivot-design-system\.css'/g)).toHaveLength(1)
  })

  it('keeps the Figma canvas fixed and delegates undersized-window scrolling to the root viewport', () => {
    const css = readFileSync(path.join(rendererRoot, 'pivot-design-system.css'), 'utf8')
    const baseCss = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8')
    const v2Css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')

    expect(css).toContain('scrollbar-gutter: stable')
    expect(css).toContain('scrollbar-color:')
    expect(css).toContain('--pv-design-canvas-width: 1440px')
    expect(css).toContain('--pv-design-canvas-height: 900px')
    expect(baseCss).toMatch(/#root\s*\{[^}]*overflow:\s*auto/s)
    expect(css).toMatch(/\.pv-app-shell\s*\{[^}]*min-width:\s*var\(--pv-design-canvas-width\)[^}]*min-height:\s*var\(--pv-design-canvas-height\)/s)
    expect(css).toMatch(/\.pv-studio-stage\s*>\s*\.pv-(?:now-workspace|database-workspace)[^{]*\{[^}]*overflow:\s*auto/s)
    expect(css).not.toMatch(/@media \(max-width:/)
    expect(v2Css).not.toMatch(/@media \(max-width:/)
  })
})
