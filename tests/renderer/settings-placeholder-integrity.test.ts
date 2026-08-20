import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Settings placeholder integrity', () => {
  it('renders honest empty states for sections without production backing', () => {
    const workspace = readFileSync(path.resolve('src/renderer/components/settings-workspace-v2.tsx'), 'utf8')
    expect(workspace).toContain('SettingsEmptyState')
    for (const id of ['runtimes', 'agents', 'skills', 'commands', 'mcp', 'plugins', 'downloads', 'automations', 'privacy', 'data', 'advanced']) {
      expect(workspace).toContain(`id === '${id}'`)
    }
    for (const fakePage of ['RuntimesSettingsPage', 'AgentsSettingsPage', 'SkillsSettingsPage', 'SlashCommandsSettingsPage', 'McpSettingsPage', 'PluginsSettingsPage', 'DownloadsSettingsPage', 'AutomationsSettingsPage', 'PrivacySettingsPage', 'DataStorageSettingsPage', 'AdvancedSettingsPage']) {
      expect(workspace).not.toContain(`<${fakePage}`)
    }
  })

  it('keeps Appearance limited to preferences that change production behavior', () => {
    const source = readFileSync(path.resolve('src/renderer/components/settings-core-pages.tsx'), 'utf8')
    const appearance = source.slice(
      source.indexOf('export function AppearanceSettingsPage'),
      source.indexOf('export function RuntimesSettingsPage'),
    )
    expect(appearance).toContain('updatePreferences({ theme: value })')
    expect(appearance).not.toContain('useStoredSetting')
    expect(appearance).not.toContain('Reduced motion')
    expect(appearance).not.toContain('Line numbers')
  })

  it('allows settings content and controls to reflow at the minimum app width', () => {
    const css = readFileSync(path.resolve('src/renderer/pivot-v2.css'), 'utf8')
    expect(css).toMatch(/@media \(max-width: 940px\)[\s\S]*\.pv-settings-layout\s*\{[^}]*grid-template-columns:\s*190px minmax\(0, 1fr\)/s)
    expect(css).toMatch(/@media \(max-width: 940px\)[\s\S]*\.pv-setting-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
    expect(css).toMatch(/\.pv-setting-action\s*\{[^}]*flex-wrap:\s*wrap/s)
  })
})
