import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('application update settings contract', () => {
  it('keeps the update engine available behind the Figma Updates surface', () => {
    const settings = readFileSync(path.resolve('src/renderer/components/settings-core-pages.tsx'), 'utf8')
    const store = readFileSync(path.resolve('src/renderer/stores/update.store.ts'), 'utf8')
    expect(settings).toContain('UpdatesSettingsPage')
    expect(settings).toContain('CURRENT VERSION')
    expect(settings).toContain('UPDATE SETTINGS')
    expect(settings).toContain('void check()')
    expect(store).toContain("window.pivot.invoke('update:state'")
    expect(store).toContain("window.pivot.invoke('update:check'")
    expect(store).toContain("window.pivot.invoke('update:download'")
    expect(store).toContain("window.pivot.invoke('update:install'")
  })
})
