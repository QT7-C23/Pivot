import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('current Pivot UI V2 design-system contract', () => {
  it('loads the current Figma semantic layer after compatibility styles', () => {
    const entry = readFileSync(path.join(rendererRoot, 'main.tsx'), 'utf8')
    const v2Index = entry.indexOf("import './pivot-v2.css'")
    const systemIndex = entry.indexOf("import './pivot-design-system.css'")

    expect(v2Index).toBeGreaterThan(-1)
    expect(systemIndex).toBeGreaterThan(v2Index)
  })

  it('defines the semantic tokens applied by the current Figma Variables', () => {
    const css = readFileSync(path.join(rendererRoot, 'pivot-design-system.css'), 'utf8')
    for (const token of [
      '--pv-text-disabled',
      '--pv-border-subtle',
      '--pv-border-focus',
      '--pv-status-success',
      '--pv-status-info',
      '--pv-shadow-card',
      '--pv-shadow-floating',
      '--pv-shadow-popover',
      '--pv-duration-fast',
    ]) {
      expect(css).toContain(`${token}:`)
    }
    for (const value of ['#adb3b0', '#e5e7eb', '#4a8a60', '#9a6060']) {
      expect(css).toContain(value)
    }
  })

  it('maps the Figma button variants and loading behavior without breaking legacy callers', () => {
    const button = readFileSync(path.join(rendererRoot, 'components/ui-button.tsx'), 'utf8')
    for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'default', 'outline', 'destructive']) {
      expect(button).toContain(`${variant}:`)
    }
    expect(button).toContain('loading?: boolean')
    expect(button).toContain("aria-busy={loading || undefined}")
    expect(button).toContain('disabled={disabled || loading}')
    expect(button).toContain('pv-ui-button--loading')
  })

  it('binds the shell and settings to the current Figma component and screen nodes', () => {
    const shell = readFileSync(path.join(rendererRoot, 'components/pivot-app-shell.tsx'), 'utf8')
    const settings = readFileSync(path.join(rendererRoot, 'components/settings-workspace-v2.tsx'), 'utf8')
    const now = readFileSync(path.join(rendererRoot, 'components/now-workspace.tsx'), 'utf8')

    expect(shell).toContain('data-figma-component="1337:9921"')
    expect(now).toContain('data-figma-screen="1026:8514"')
    for (const node of [
      '818:4102', '818:4269', '1171:9637', '818:11341', '818:4642',
      '818:4820', '818:12358', '818:5141', '818:5444', '818:11070',
      '818:5762', '818:4457', '818:5929', '818:6184', '818:6343',
      '818:6499', '818:18002', '818:6686',
    ]) {
      expect(settings).toContain(`'${node}'`)
    }
  })

  it('keeps the shell on the fixed Figma canvas while long content remains readable', () => {
    const css = readFileSync(path.join(rendererRoot, 'pivot-design-system.css'), 'utf8')
    expect(css).toMatch(/\.pv-app-shell\s*\{[^}]*min-width:\s*var\(--pv-design-canvas-width\)/s)
    expect(css).toContain('--pv-design-canvas-width: 1440px')
    expect(css).not.toMatch(/@media \(max-width:/)
    expect(css).toContain('overflow-wrap: anywhere')
  })
})
