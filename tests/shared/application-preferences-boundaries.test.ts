import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')

describe('application preferences boundaries', () => {
  it('keeps the shared contract independent from Main and Renderer', () => {
    const source = readFileSync(path.join(root, 'shared/application-preferences.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]\.\.\/(main|renderer)/)
    expect(source).not.toContain('better-sqlite3')
    expect(source).not.toContain('localStorage')
  })

  it('keeps persistence behind narrow Ports and out of Renderer', () => {
    const ports = readFileSync(path.join(root, 'main/services/application-preferences-ports.ts'), 'utf8')
    const renderer = readFileSync(path.join(root, 'renderer/components/settings-core-pages.tsx'), 'utf8')
    expect(ports).toContain('ApplicationPreferencesReaderPort')
    expect(ports).toContain('ApplicationPreferencesWriterPort')
    expect(ports).not.toContain('Database')
    expect(renderer).not.toContain("useStoredSetting('date-format'")
    expect(renderer).not.toContain("useStoredSetting('start-minimized'")
    expect(renderer).not.toContain('better-sqlite3')
  })
})
