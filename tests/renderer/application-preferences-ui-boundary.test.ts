import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Figma General settings production wiring', () => {
  it('loads and updates Main-owned preferences instead of localStorage', () => {
    const page = readFileSync(path.resolve('src/renderer/components/settings-core-pages.tsx'), 'utf8')
    const store = readFileSync(path.resolve('src/renderer/stores/application-preferences.store.ts'), 'utf8')
    const app = readFileSync(path.resolve('src/renderer/pivot-app.tsx'), 'utf8')
    const bootstrap = readFileSync(path.resolve('src/renderer/hooks/usePivotAppBootstrap.ts'), 'utf8')
    expect(page).toContain('useApplicationPreferencesStore')
    expect(page).toContain('void loadPreferences()')
    expect(page).toContain('updatePreference')
    expect(page).not.toContain("useStoredSetting('date-format'")
    expect(page).not.toContain("useStoredSetting('start-minimized'")
    expect(store).toContain('ApplicationPreferencesSchema.parse')
    expect(store).toContain('ApplicationPreferencesUpdateRequestSchema.parse')
    expect(store).not.toContain('localStorage')
    expect(app).toContain('usePivotAppBootstrap')
    expect(bootstrap).toContain('useApplicationPreferencesStore')
    expect(bootstrap).toContain("import('../stores/application-preferences.store')")
    expect(bootstrap).toContain('state.preferences ?? await state.load()')
    expect(bootstrap).toContain('preferences.values.locale !== locale')
    expect(bootstrap).toContain('preferences.values.theme')
    expect(page).toContain("updatePreferences({ theme: value })")
    expect(page).not.toContain("useStoredSetting('theme'")
  })
})
