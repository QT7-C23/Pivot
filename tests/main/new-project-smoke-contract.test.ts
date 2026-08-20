import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('New Project production smoke contract', () => {
  it('creates a real project through the Figma modal and enters its Session', () => {
    const root = process.cwd()
    const script = readFileSync(path.join(root, 'scripts/e2e-smoke.mjs'), 'utf8')
    const main = readFileSync(path.join(root, 'src/main/main.ts'), 'utf8')

    expect(script).toContain("process.argv.includes('--new-project')")
    expect(script).toContain('PIVOT_E2E_NEW_PROJECT')
    expect(script).toContain('PIVOT_E2E_NEW_PROJECT_PARENT')
    expect(main).toContain("process.env['PIVOT_E2E_NEW_PROJECT'] === '1'")
    expect(main).toContain("waitFor('.pv-new-project-dialog')")
    expect(main).toContain("valueSetter?.call(nameInput, 'smoke-project')")
    expect(main).toContain("waitFor('.route-sessions')")
    expect(main).toContain('newProjectPresence')
  })
})
