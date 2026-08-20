import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Figma Variables color contract', () => {
  it('defines the current light semantic palette from Pivot UI V2', () => {
    const css = readFileSync(path.resolve('src/renderer/pivot-v2.css'), 'utf8')
    for (const declaration of [
      '--pv-bg-canvas: #f3f1ec',
      '--pv-bg-surface: #faf9f6',
      '--pv-bg-elevated: #ffffff',
      '--pv-bg-subtle: #fafafa',
      '--pv-border-default: #d8d5ce',
      '--pv-text-primary: #1c201f',
      '--pv-text-secondary: #626965',
      '--pv-accent-default: #19766f',
      '--pv-accent-emphasis: #3d7e72',
    ]) expect(css).toContain(declaration)
  })

  it('routes component foreground and inactive control colors through semantic variables', () => {
    const css = readFileSync(path.resolve('src/renderer/pivot-v2.css'), 'utf8')
    expect(css).toContain('--pv-text-on-accent:')
    expect(css).toContain('--pv-control-track:')
    expect(css).toMatch(/\.pv-toggle\s*\{[^}]*background:\s*var\(--pv-control-track\)/s)
    expect(css).toMatch(/\.pv-settings-button\.primary\s*\{[^}]*color:\s*var\(--pv-text-on-accent\)/s)
  })
})
