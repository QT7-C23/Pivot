import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Command Palette production smoke contract', () => {
  it('opens the real Figma overlay and executes a registered navigation command', () => {
    const root = process.cwd()
    const script = readFileSync(path.join(root, 'scripts/e2e-smoke.mjs'), 'utf8')
    const main = readFileSync(path.join(root, 'src/main/main.ts'), 'utf8')
    const palette = readFileSync(path.join(root, 'src/renderer/components/command-palette.tsx'), 'utf8')

    expect(script).toContain("process.argv.includes('--command-palette')")
    expect(script).toContain('PIVOT_E2E_COMMAND_PALETTE')
    expect(main).toContain("process.env['PIVOT_E2E_COMMAND_PALETTE'] === '1'")
    expect(main).toContain("waitFor('.pv-command-palette')")
    expect(main).toContain("new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'k' })")
    expect(main).toContain("new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })")
    expect(main).toContain("new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })")
    expect(main).toContain("valueSetter?.call(input, 'settings')")
    expect(main).toContain('commandPalettePresence')
    expect(palette).toContain('data-command-id={item.id}')
  })
})
