import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('free plugin ecosystem policy', () => {
  it('defines an all-free distribution contract in the repository', () => {
    const policy = readFileSync(path.join(projectRoot, 'docs/free-ecosystem-policy.md'), 'utf8')

    expect(policy).toContain('Every plugin, Skill, theme, prompt, and workflow distributed through Pivot is free to install and use.')
    expect(policy).toContain('No price, purchase, subscription, trial, license tier, or revenue-share field')
    expect(policy).toContain('Self-hosted private catalogs')
  })

  it('presents an honest empty plugin setting and a commerce-free verified catalog', () => {
    const page = readFileSync(path.join(projectRoot, 'src/renderer/components/plugin-ecosystem-page.tsx'), 'utf8')
    const settings = readFileSync(path.join(projectRoot, 'src/renderer/components/settings-workspace-v2.tsx'), 'utf8')

    expect(settings).toContain("activeSection === 'plugins' && <SettingsEmptyState")
    expect(settings).not.toContain("activeSection === 'plugins' && <PluginsSettingsPage />")
    expect(page).toContain('Free and signed only')
    expect(page).toContain('catalog.snapshot.entries')
    expect(page).not.toMatch(/price|purchase|subscribe|subscription|checkout|trial/i)
  })

  it('keeps commerce language out of Pivot plugin copy', () => {
    const locale = readFileSync(path.join(projectRoot, 'src/renderer/i18n/locale.ts'), 'utf8')
    const pluginCopy = locale.split("'settings.plugins.title'").slice(1).map((block) => block.slice(0, 1600)).join('\n')

    expect(pluginCopy).toContain('free community catalog')
    expect(pluginCopy).toContain('全部免费')
    expect(pluginCopy).not.toMatch(/paid plugin|付费插件|commercial plugin|商业插件|购买插件|插件订阅/i)
  })
})
