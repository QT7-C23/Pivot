import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSpotlightPosition, supportsSpotlightPointer } from '../../src/renderer/lib/spotlight'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('Spotlight surface contract', () => {
  it('maps pointer coordinates into a surface and clamps them to its bounds', () => {
    const bounds = { height: 80, left: 100, top: 40, width: 240 }

    expect(getSpotlightPosition(180, 70, bounds)).toEqual({ x: 80, y: 30 })
    expect(getSpotlightPosition(20, 500, bounds)).toEqual({ x: 0, y: 80 })
  })

  it('tracks precise pointers but leaves touch surfaces static', () => {
    expect(supportsSpotlightPointer('mouse')).toBe(true)
    expect(supportsSpotlightPointer('pen')).toBe(true)
    expect(supportsSpotlightPointer('touch')).toBe(false)
  })

  it('updates CSS properties without renderer state churn and is frame-throttled', () => {
    const source = readFileSync(path.join(rendererRoot, 'components/spotlight-surface.tsx'), 'utf8')

    expect(source).toContain('requestAnimationFrame')
    expect(source).toContain("style.setProperty('--spotlight-x'")
    expect(source).toContain("style.setProperty('--spotlight-y'")
    expect(source).not.toContain('useState')
  })

  it('is scoped to intended decision surfaces and respects reduced motion', () => {
    const welcome = readFileSync(path.join(rendererRoot, 'components/welcome-screen.tsx'), 'utf8')
    const provider = readFileSync(path.join(rendererRoot, 'components/provider-workspace.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'pivot-012.css'), 'utf8')

    expect(welcome).toContain('<SpotlightSurface')
    expect(provider).toContain('<SpotlightButton')
    expect(css).toContain('.spotlight-surface::before')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('display: none')
  })

  it('ships the upstream attribution with packaged builds', () => {
    const notice = readFileSync(path.resolve(process.cwd(), 'THIRD_PARTY_NOTICES.md'), 'utf8')
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      build: { extraResources: Array<{ from: string; to: string }> }
    }

    expect(notice).toContain('React Bits')
    expect(notice).toContain('Copyright (c) 2026 David Haz')
    expect(notice).toContain('Commons Clause Restriction')
    expect(packageJson.build.extraResources).toContainEqual({ from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' })
  })
})
