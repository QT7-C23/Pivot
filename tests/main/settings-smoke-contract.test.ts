import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Settings production smoke contract', () => {
  it('recognizes every Settings V2 heading shape and exact current Figma navigation', () => {
    const main = readFileSync(path.resolve('src/main/main.ts'), 'utf8')
    expect(main).toContain('.pv-settings-page h1')
    expect(main).toContain('.pv-provider-settings > header h1')
    expect(main).toContain('.pv-about-hero h1')
    expect(main).toContain('.pv-settings-empty > strong')
    expect(main).toContain("'Advanced', 'Feedback', 'About'")
    expect(main).toContain("result.sectionHeadings?.includes('Feedback')")
    expect(main).not.toContain('settingsLabels?.length === 17')
  })
})
